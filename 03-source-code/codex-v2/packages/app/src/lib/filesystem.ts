// ============================================================================
// CodeEX v2 — Filesystem Abstraction Layer
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Unified IFileSystem interface with three backends:
//   1. BrowserFS  — File System Access API + IndexedDB (web fallback)
//   2. TerraRuntimeFS — TerraRuntime invoke bridge (desktop)
//   3. RemoteFS   — WebSocket to TerraForge / CloudVI (cloud)
//
// The entire IDE reads/writes through this one interface.
// Swap the backend, zero UI changes.
// ============================================================================

import type { FileNode } from "./types";

// ============================================================================
// Core Types
// ============================================================================

export interface FileStat {
  path: string;
  name: string;
  type: "file" | "directory";
  size: number;
  modified: number;
  created: number;
}

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface FileWatchEvent {
  type: "create" | "modify" | "delete" | "rename";
  path: string;
  oldPath?: string;
}

export type FileSystemBackend = "browser" | "terraruntime" | "remote" | "demo";

// ============================================================================
// IFileSystem Interface
// ============================================================================

export interface IFileSystem {
  /** Backend identifier */
  readonly backend: FileSystemBackend;

  /** Current working directory */
  cwd(): string;

  /** Set working directory */
  setCwd(path: string): void;

  /** Read file content as string */
  readFile(path: string): Promise<string>;

  /** Write file content */
  writeFile(path: string, content: string): Promise<void>;

  /** Delete a file or directory */
  delete(path: string, recursive?: boolean): Promise<void>;

  /** Create a directory */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /** Rename / move a file or directory */
  rename(oldPath: string, newPath: string): Promise<void>;

  /** Check if a path exists */
  exists(path: string): Promise<boolean>;

  /** Get file/directory stats */
  stat(path: string): Promise<FileStat>;

  /** List directory contents as FileNode tree */
  readDir(path: string, depth?: number): Promise<FileNode[]>;

  /** Search file contents across the workspace */
  searchFiles(query: string, options?: { caseSensitive?: boolean; maxResults?: number }): Promise<Map<string, SearchMatch[]>>;

  /** Watch for file changes (returns unsubscribe function) */
  watch?(path: string, callback: (event: FileWatchEvent) => void): () => void;

  /** Open a directory picker (browser) or set root (desktop) */
  openDirectory?(): Promise<string | null>;

  /** Open a file picker */
  openFile?(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
}

// ============================================================================
// DemoFS — In-memory demo filesystem (development fallback)
// ============================================================================

import { demoFiles } from "./demo-files";

class DemoFS implements IFileSystem {
  readonly backend: FileSystemBackend = "demo";
  private _cwd = "/project";
  private files: Record<string, string>;

  constructor() {
    this.files = { ...demoFiles };
  }

  cwd() { return this._cwd; }
  setCwd(path: string) { this._cwd = path; }

  async readFile(path: string): Promise<string> {
    const normalized = this.normalize(path);
    if (normalized in this.files) return this.files[normalized];
    throw new Error(`ENOENT: ${path}`);
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files[this.normalize(path)] = content;
  }

  async delete(path: string): Promise<void> {
    const normalized = this.normalize(path);
    delete this.files[normalized];
    // Also delete children if directory
    for (const key of Object.keys(this.files)) {
      if (key.startsWith(normalized + "/")) delete this.files[key];
    }
  }

  async mkdir(_path: string): Promise<void> {
    // Directories are implicit in the flat map
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldN = this.normalize(oldPath);
    const newN = this.normalize(newPath);
    if (oldN in this.files) {
      this.files[newN] = this.files[oldN];
      delete this.files[oldN];
    }
    // Rename children
    for (const key of Object.keys(this.files)) {
      if (key.startsWith(oldN + "/")) {
        const newKey = newN + key.slice(oldN.length);
        this.files[newKey] = this.files[key];
        delete this.files[key];
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalize(path);
    if (normalized in this.files) return true;
    // Check if it's a directory (any file starts with path/)
    return Object.keys(this.files).some((k) => k.startsWith(normalized + "/"));
  }

  async stat(path: string): Promise<FileStat> {
    const normalized = this.normalize(path);
    const isFile = normalized in this.files;
    const isDir = !isFile && Object.keys(this.files).some((k) => k.startsWith(normalized + "/"));
    if (!isFile && !isDir) throw new Error(`ENOENT: ${path}`);
    const name = normalized.split("/").pop() ?? normalized;
    return {
      path: normalized,
      name,
      type: isFile ? "file" : "directory",
      size: isFile ? this.files[normalized].length : 0,
      modified: Date.now(),
      created: Date.now(),
    };
  }

  async readDir(path: string, depth = 1): Promise<FileNode[]> {
    const normalized = this.normalize(path);
    const prefix = normalized ? normalized + "/" : "";
    const seen = new Map<string, FileNode>();

    for (const filePath of Object.keys(this.files)) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      const parts = relative.split("/");

      if (parts.length === 1) {
        // Direct file
        seen.set(parts[0], {
          name: parts[0],
          path: filePath,
          type: "file",
        });
      } else if (depth > 0) {
        // Directory
        const dirName = parts[0];
        if (!seen.has(dirName)) {
          const dirPath = prefix + dirName;
          const children = depth > 1 ? await this.readDir(dirPath, depth - 1) : undefined;
          seen.set(dirName, {
            name: dirName,
            path: dirPath,
            type: "directory",
            children,
          });
        }
      }
    }

    // Sort: directories first, then alphabetical
    return [...seen.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async searchFiles(query: string, options?: { caseSensitive?: boolean; maxResults?: number }): Promise<Map<string, SearchMatch[]>> {
    const results = new Map<string, SearchMatch[]>();
    if (!query || query.length < 2) return results;

    const cs = options?.caseSensitive ?? false;
    const maxResults = options?.maxResults ?? 5000;
    const needle = cs ? query : query.toLowerCase();
    let totalCount = 0;

    for (const [file, content] of Object.entries(this.files)) {
      const lines = content.split("\n");
      const matches: SearchMatch[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const haystack = cs ? line : line.toLowerCase();
        let searchFrom = 0;

        while (true) {
          const idx = haystack.indexOf(needle, searchFrom);
          if (idx === -1) break;
          matches.push({ file, line: i + 1, text: line, matchStart: idx, matchEnd: idx + query.length });
          searchFrom = idx + 1;
          totalCount++;
          if (totalCount >= maxResults) break;
        }
        if (totalCount >= maxResults) break;
      }

      if (matches.length > 0) results.set(file, matches);
      if (totalCount >= maxResults) break;
    }

    return results;
  }

  /** Get raw files map (for backwards compatibility during migration) */
  getFiles(): Record<string, string> {
    return this.files;
  }

  private normalize(path: string): string {
    return path.replace(/^\/+/, "").replace(/\/+$/, "");
  }
}

// ============================================================================
// BrowserFS — File System Access API + IndexedDB persistence
// ============================================================================

class BrowserFS implements IFileSystem {
  readonly backend: FileSystemBackend = "browser";
  private _cwd = "/";
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private idbName = "codex-fs";

  cwd() { return this._cwd; }
  setCwd(path: string) { this._cwd = path; }

  async openDirectory(): Promise<string | null> {
    if (!("showDirectoryPicker" in window)) return null;
    try {
      this.rootHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      this._cwd = "/" + (this.rootHandle?.name ?? "project");
      return this._cwd;
    } catch {
      return null;
    }
  }

  async openFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
    if (!("showOpenFilePicker" in window)) return null;
    try {
      const types = filters?.map((f) => ({
        description: f.name,
        accept: { "*/*": f.extensions.map((e) => `.${e}`) },
      }));
      const [handle] = await (window as any).showOpenFilePicker({ types });
      const file = await handle.getFile();
      return file.name;
    } catch {
      return null;
    }
  }

  private async resolveHandle(path: string): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
    if (!this.rootHandle) throw new Error("No directory opened. Use openDirectory() first.");
    const parts = this.normalizeParts(path);
    let current: FileSystemDirectoryHandle = this.rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }
    if (parts.length === 0) return current;
    const last = parts[parts.length - 1];
    // Try file first, then directory
    try {
      return await current.getFileHandle(last);
    } catch {
      return await current.getDirectoryHandle(last);
    }
  }

  async readFile(path: string): Promise<string> {
    const handle = await this.resolveHandle(path);
    if (handle.kind !== "file") throw new Error(`Not a file: ${path}`);
    const file = await (handle as FileSystemFileHandle).getFile();
    return file.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No directory opened.");
    const parts = this.normalizeParts(path);
    let current = this.rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }

  async delete(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No directory opened.");
    const parts = this.normalizeParts(path);
    let current = this.rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }
    await (current as any).removeEntry(parts[parts.length - 1], { recursive: true });
  }

  async mkdir(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No directory opened.");
    const parts = this.normalizeParts(path);
    let current = this.rootHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    // File System Access API doesn't have native rename — copy + delete
    const content = await this.readFile(oldPath);
    await this.writeFile(newPath, content);
    await this.delete(oldPath);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.resolveHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const handle = await this.resolveHandle(path);
    const name = handle.name;
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      return { path, name, type: "file", size: file.size, modified: file.lastModified, created: file.lastModified };
    }
    return { path, name, type: "directory", size: 0, modified: Date.now(), created: Date.now() };
  }

  async readDir(path: string, depth = 1): Promise<FileNode[]> {
    if (!this.rootHandle) return [];
    const parts = this.normalizeParts(path);
    let current = this.rootHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    const nodes: FileNode[] = [];
    for await (const [name, handle] of (current as any).entries()) {
      const childPath = path ? `${path}/${name}` : name;
      if (handle.kind === "directory") {
        const children = depth > 1 ? await this.readDir(childPath, depth - 1) : undefined;
        nodes.push({ name, path: childPath, type: "directory", children });
      } else {
        nodes.push({ name, path: childPath, type: "file" });
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async searchFiles(query: string, options?: { caseSensitive?: boolean; maxResults?: number }): Promise<Map<string, SearchMatch[]>> {
    // Walk all files and search
    const results = new Map<string, SearchMatch[]>();
    if (!this.rootHandle || !query || query.length < 2) return results;

    const cs = options?.caseSensitive ?? false;
    const maxResults = options?.maxResults ?? 5000;
    const needle = cs ? query : query.toLowerCase();
    let totalCount = 0;

    const walk = async (dirHandle: FileSystemDirectoryHandle, basePath: string) => {
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (totalCount >= maxResults) return;
        const childPath = basePath ? `${basePath}/${name}` : name;
        if (handle.kind === "directory") {
          // Skip node_modules, .git, dist
          if (name === "node_modules" || name === ".git" || name === "dist") continue;
          await walk(handle as FileSystemDirectoryHandle, childPath);
        } else {
          // Only search text files
          const ext = name.split(".").pop()?.toLowerCase() ?? "";
          const textExts = new Set(["ts", "tsx", "js", "jsx", "json", "md", "css", "html", "py", "rs", "go", "java", "c", "h", "cpp", "hpp", "yaml", "yml", "toml", "txt", "sh", "bat", "xml", "svg"]);
          if (!textExts.has(ext)) continue;

          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            if (file.size > 1_000_000) continue; // Skip files > 1MB
            const content = await file.text();
            const lines = content.split("\n");
            const matches: SearchMatch[] = [];

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const haystack = cs ? line : line.toLowerCase();
              let searchFrom = 0;
              while (true) {
                const idx = haystack.indexOf(needle, searchFrom);
                if (idx === -1) break;
                matches.push({ file: childPath, line: i + 1, text: line, matchStart: idx, matchEnd: idx + query.length });
                searchFrom = idx + 1;
                totalCount++;
                if (totalCount >= maxResults) break;
              }
              if (totalCount >= maxResults) break;
            }
            if (matches.length > 0) results.set(childPath, matches);
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    await walk(this.rootHandle, "");
    return results;
  }

  private normalizeParts(path: string): string[] {
    return path.replace(/^\/+/, "").replace(/\/+$/, "").split("/").filter(Boolean);
  }
}

// ============================================================================
// TerraRuntimeFS — TerraRuntime invoke bridge (desktop mode)
// ============================================================================

class TerraRuntimeFS implements IFileSystem {
  readonly backend: FileSystemBackend = "terraruntime";
  private _cwd = "/";

  cwd() { return this._cwd; }
  setCwd(path: string) { this._cwd = path; }

  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const terraRuntime = (window as any).__TAURI__;
    if (!terraRuntime?.core?.invoke) throw new Error("TerraRuntime not available");
    return terraRuntime.core.invoke(cmd, args);
  }

  async readFile(path: string): Promise<string> {
    return this.invoke("read_file", { path: this.resolve(path) });
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.invoke("write_file", { path: this.resolve(path), content });
  }

  async delete(path: string, recursive?: boolean): Promise<void> {
    return this.invoke("delete_path", { path: this.resolve(path), recursive: recursive ?? false });
  }

  async mkdir(path: string, recursive?: boolean): Promise<void> {
    return this.invoke("create_dir", { path: this.resolve(path), recursive: recursive ?? true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.invoke("rename_path", { oldPath: this.resolve(oldPath), newPath: this.resolve(newPath) });
  }

  async exists(path: string): Promise<boolean> {
    return this.invoke("path_exists", { path: this.resolve(path) });
  }

  async stat(path: string): Promise<FileStat> {
    return this.invoke("file_stat", { path: this.resolve(path) });
  }

  async readDir(path: string, depth = 3): Promise<FileNode[]> {
    return this.invoke("read_dir", { path: this.resolve(path), depth });
  }

  async searchFiles(query: string, options?: { caseSensitive?: boolean; maxResults?: number }): Promise<Map<string, SearchMatch[]>> {
    const results: [string, SearchMatch[]][] = await this.invoke("search_files", {
      path: this._cwd,
      query,
      caseSensitive: options?.caseSensitive ?? false,
      maxResults: options?.maxResults ?? 5000,
    });
    return new Map(results);
  }

  watch(path: string, callback: (event: FileWatchEvent) => void): () => void {
    // TerraRuntime file watching via events
    const terraRuntime = (window as any).__TAURI__;
    if (!terraRuntime?.event?.listen) return () => {};

    let unlisten: (() => void) | null = null;
    terraRuntime.event.listen("fs-watch", (event: any) => {
      if (event.payload.path.startsWith(this.resolve(path))) {
        callback(event.payload as FileWatchEvent);
      }
    }).then((fn: () => void) => { unlisten = fn; });

    // Start watching on the Rust side
    this.invoke("watch_path", { path: this.resolve(path) }).catch(() => {});

    return () => {
      unlisten?.();
      this.invoke("unwatch_path", { path: this.resolve(path) }).catch(() => {});
    };
  }

  async openDirectory(): Promise<string | null> {
    const terraRuntime = (window as any).__TAURI__;
    if (!terraRuntime?.dialog?.open) return null;
    const selected = await terraRuntime.dialog.open({ directory: true });
    if (selected) {
      this._cwd = selected as string;
      return this._cwd;
    }
    return null;
  }

  async openFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
    const terraRuntime = (window as any).__TAURI__;
    if (!terraRuntime?.dialog?.open) return null;
    const selected = await terraRuntime.dialog.open({ filters });
    return (selected as string) ?? null;
  }

  private resolve(path: string): string {
    if (path.startsWith("/") || path.match(/^[A-Za-z]:/)) return path;
    return `${this._cwd}/${path}`;
  }
}

// ============================================================================
// RemoteFS — WebSocket bridge to TerraForge / CloudVI
// ============================================================================

class RemoteFS implements IFileSystem {
  readonly backend: FileSystemBackend = "remote";
  private _cwd = "/";
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  cwd() { return this._cwd; }
  setCwd(path: string) { this._cwd = path; }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`Failed to connect to ${this.url}`));
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const pending = this.pending.get(msg.id);
          if (pending) {
            this.pending.delete(msg.id);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(msg.result);
          }
        } catch { /* ignore malformed */ }
      };
      this.ws.onclose = () => {
        // Reject all pending
        for (const [, p] of this.pending) p.reject(new Error("Connection closed"));
        this.pending.clear();
      };
    });
  }

  private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async readFile(path: string): Promise<string> {
    return this.rpc("readFile", { path: this.resolve(path) });
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.rpc("writeFile", { path: this.resolve(path), content });
  }

  async delete(path: string, recursive?: boolean): Promise<void> {
    return this.rpc("delete", { path: this.resolve(path), recursive });
  }

  async mkdir(path: string, recursive?: boolean): Promise<void> {
    return this.rpc("mkdir", { path: this.resolve(path), recursive });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.rpc("rename", { oldPath: this.resolve(oldPath), newPath: this.resolve(newPath) });
  }

  async exists(path: string): Promise<boolean> {
    return this.rpc("exists", { path: this.resolve(path) });
  }

  async stat(path: string): Promise<FileStat> {
    return this.rpc("stat", { path: this.resolve(path) });
  }

  async readDir(path: string, depth = 3): Promise<FileNode[]> {
    return this.rpc("readDir", { path: this.resolve(path), depth });
  }

  async searchFiles(query: string, options?: { caseSensitive?: boolean; maxResults?: number }): Promise<Map<string, SearchMatch[]>> {
    const results: [string, SearchMatch[]][] = await this.rpc("searchFiles", {
      path: this._cwd,
      query,
      caseSensitive: options?.caseSensitive ?? false,
      maxResults: options?.maxResults ?? 5000,
    });
    return new Map(results);
  }

  watch(path: string, callback: (event: FileWatchEvent) => void): () => void {
    const watchId = ++this.requestId;
    this.rpc("watch", { path: this.resolve(path), watchId }).catch(() => {});

    // Listen for watch events on the WebSocket
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "watch" && msg.watchId === watchId) {
          callback(msg.event as FileWatchEvent);
        }
      } catch { /* ignore */ }
    };
    this.ws?.addEventListener("message", handler);

    return () => {
      this.ws?.removeEventListener("message", handler);
      this.rpc("unwatch", { watchId }).catch(() => {});
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  private resolve(path: string): string {
    if (path.startsWith("/")) return path;
    return `${this._cwd}/${path}`;
  }
}

// ============================================================================
// Filesystem Provider — Runtime detection + singleton access
// ============================================================================

let _fs: IFileSystem | null = null;

/** Detect the best available filesystem backend. */
function detectBackend(): FileSystemBackend {
  // Check for TerraRuntime
  if ((window as any).__TAURI__?.core?.invoke) return "terraruntime";

  // Check for File System Access API (Chrome/Edge 86+)
  if ("showDirectoryPicker" in window) return "browser";

  // Fallback to demo
  return "demo";
}

/** Get or create the filesystem singleton. */
export function getFS(): IFileSystem {
  if (_fs) return _fs;

  const backend = detectBackend();
  switch (backend) {
    case "terraruntime":
      _fs = new TerraRuntimeFS();
      break;
    case "browser":
      // Start with demo, upgrade to BrowserFS when user opens a directory
      _fs = new DemoFS();
      break;
    case "demo":
    default:
      _fs = new DemoFS();
      break;
  }

  return _fs;
}

/** Notify listeners that the filesystem backend changed. */
function notifyFSChange() {
  window.dispatchEvent(new CustomEvent("codex-fs-change"));
}

/** Upgrade to BrowserFS (triggered by "Open Folder" action). */
export async function upgradeToBrowserFS(): Promise<string | null> {
  const browserFS = new BrowserFS();
  const dir = await browserFS.openDirectory();
  if (dir) {
    _fs = browserFS;
    notifyFSChange();
    return dir;
  }
  return null;
}

/** Connect to a remote filesystem via WebSocket. */
export async function connectRemoteFS(url: string): Promise<string> {
  const remoteFS = new RemoteFS(url);
  await remoteFS.connect();
  _fs = remoteFS;
  notifyFSChange();
  return remoteFS.cwd();
}

/** Check if File System Access API is available. */
export function isFSAccessAvailable(): boolean {
  return "showDirectoryPicker" in window;
}

/** Check if TerraRuntime is available. */
export function isTerraRuntimeAvailable(): boolean {
  return !!(window as any).__TAURI__?.core?.invoke;
}

/** Get the current backend type. */
export function getCurrentBackend(): FileSystemBackend {
  return _fs?.backend ?? "demo";
}

/** Get the opened root folder name (extracted from cwd). */
export function getRootName(): string | null {
  if (!_fs || _fs.backend === "demo") return null;
  const cwd = _fs.cwd();
  if (!cwd || cwd === "/") return null;
  // cwd is "/FolderName" (BrowserFS) or "C:\path\to\folder" (TerraRuntime)
  const name = cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return name ?? null;
}

/** Reset to demo filesystem. */
export function resetToDemo(): void {
  _fs = new DemoFS();
  notifyFSChange();
}

// Re-export SearchMatch for backwards compatibility
export type { SearchMatch as FSSearchMatch };
