// ============================================================================
// CodeEX v2 — User Snippets
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Custom user snippet loading from .code-snippets files.
// Compatible with VS Code snippet format. Loaded from workspace
// .codex/snippets/ directory via filesystem abstraction.
// ============================================================================

import { createSignal } from "solid-js";
import { getFS } from "./filesystem";

export interface UserSnippetDef {
  prefix: string;
  body: string;
  description: string;
  scope?: string;
}

export interface SnippetFile {
  name: string;
  path: string;
  snippets: UserSnippetDef[];
}

// ── State ──

const STORAGE_KEY = "codex_user_snippets";
const [snippetFiles, setSnippetFiles] = createSignal<SnippetFile[]>([]);
const [userSnippetMap, setUserSnippetMap] = createSignal<Map<string, UserSnippetDef[]>>(new Map());

export { snippetFiles };

// ── Load from localStorage (fallback for web) ──

function loadCached(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const files: SnippetFile[] = JSON.parse(raw);
      setSnippetFiles(files);
      rebuildMap(files);
    }
  } catch {}
}

function saveToCache(files: SnippetFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {}
}

function rebuildMap(files: SnippetFile[]): void {
  const map = new Map<string, UserSnippetDef[]>();

  for (const file of files) {
    for (const s of file.snippets) {
      const scopes = s.scope ? s.scope.split(",").map(l => l.trim().toLowerCase()) : ["*"];
      for (const scope of scopes) {
        if (!map.has(scope)) map.set(scope, []);
        map.get(scope)!.push(s);
      }
    }
  }

  setUserSnippetMap(map);
}

// ── File Extension → Language Scope Mapping ──

function extToScope(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": return "typescript";
    case "js": case "jsx": case "mjs": case "cjs": return "javascript";
    case "py": return "python";
    case "rs": return "rust";
    case "json": return "json";
    case "html": case "htm": return "html";
    case "css": return "css";
    case "md": case "markdown": return "markdown";
    case "go": return "go";
    case "java": return "java";
    case "c": case "h": return "c";
    case "cpp": case "hpp": case "cc": return "cpp";
    default: return ext;
  }
}

// ── Parse VS Code .code-snippets Format ──

export function parseCodeSnippets(content: string): UserSnippetDef[] {
  const result: UserSnippetDef[] = [];

  try {
    const json = JSON.parse(content);

    for (const [_name, def] of Object.entries<any>(json)) {
      if (!def || typeof def !== "object") continue;

      const prefix = typeof def.prefix === "string" ? def.prefix
        : Array.isArray(def.prefix) ? def.prefix[0] : "";
      if (!prefix) continue;

      const body = Array.isArray(def.body) ? def.body.join("\n") : (typeof def.body === "string" ? def.body : "");
      const description = typeof def.description === "string" ? def.description : prefix;
      const scope = typeof def.scope === "string" ? def.scope : undefined;

      // Convert VS Code tabstop syntax to CM6 snippet syntax
      // VS Code: $1, ${1:default}, $0
      // CM6: ${}, ${name}
      const template = convertVSCodeToCM6(body);

      result.push({ prefix, body: template, description, scope });
    }
  } catch {}

  return result;
}

/** Convert VS Code snippet syntax to CM6 snippet() template syntax. */
function convertVSCodeToCM6(body: string): string {
  let result = body;

  // ${1:placeholder} → ${placeholder}
  result = result.replace(/\$\{(\d+):([^}]+)\}/g, (_m, _n, placeholder) => `\${${placeholder}}`);

  // $1, $2, etc. → ${}
  result = result.replace(/\$(\d+)/g, "${}");

  // $0 (final cursor) → ${}
  result = result.replace(/\$\{0\}/g, "${}");

  return result;
}

// ── Public API ──

/** Get user snippets for a given file path (by language scope). */
export function getUserSnippetsForFile(filePath: string): UserSnippetDef[] {
  const scope = extToScope(filePath);
  const map = userSnippetMap();
  const scoped = map.get(scope) || [];
  const global = map.get("*") || [];
  return [...scoped, ...global];
}

/** Load user snippets from .codex/snippets/ directory in the workspace. */
export async function loadUserSnippets(workspaceRoot?: string): Promise<void> {
  const fs = getFS();
  const loaded: SnippetFile[] = [];

  // Try loading from .codex/snippets/ in workspace root
  const snippetDir = workspaceRoot
    ? `${workspaceRoot}/.codex/snippets`
    : ".codex/snippets";

  try {
    const entries = await fs.readDir(snippetDir);
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".code-snippets")) {
        try {
          const content = await fs.readFile(`${snippetDir}/${entry.name}`);
          const snippets = parseCodeSnippets(content);
          if (snippets.length > 0) {
            loaded.push({ name: entry.name, path: `${snippetDir}/${entry.name}`, snippets });
          }
        } catch {}
      }
    }
  } catch {
    // .codex/snippets/ may not exist — that's fine
  }

  // Also try loading from .vscode/ for VS Code compatibility
  const vscodeDir = workspaceRoot
    ? `${workspaceRoot}/.vscode`
    : ".vscode";

  try {
    const entries = await fs.readDir(vscodeDir);
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".code-snippets")) {
        try {
          const content = await fs.readFile(`${vscodeDir}/${entry.name}`);
          const snippets = parseCodeSnippets(content);
          if (snippets.length > 0) {
            loaded.push({ name: entry.name, path: `${vscodeDir}/${entry.name}`, snippets });
          }
        } catch {}
      }
    }
  } catch {}

  setSnippetFiles(loaded);
  rebuildMap(loaded);
  saveToCache(loaded);

  if (loaded.length > 0) {
    document.dispatchEvent(new CustomEvent("codex:snippets-loaded", {
      detail: { count: loaded.reduce((sum, f) => sum + f.snippets.length, 0), files: loaded.length },
    }));
  }
}

/** Add a snippet file manually (for inline creation in Settings). */
export function addSnippetFile(name: string, content: string): void {
  const snippets = parseCodeSnippets(content);
  if (snippets.length === 0) return;

  const file: SnippetFile = { name, path: `inline:${name}`, snippets };
  const updated = [...snippetFiles(), file];
  setSnippetFiles(updated);
  rebuildMap(updated);
  saveToCache(updated);
}

/** Remove a snippet file by name. */
export function removeSnippetFile(name: string): void {
  const updated = snippetFiles().filter(f => f.name !== name);
  setSnippetFiles(updated);
  rebuildMap(updated);
  saveToCache(updated);
}

/** Get total count of user snippets. */
export function getUserSnippetCount(): number {
  return snippetFiles().reduce((sum, f) => sum + f.snippets.length, 0);
}

/** Update a single snippet within a file by index. */
export function updateSnippetInFile(fileName: string, index: number, updated: Partial<Pick<UserSnippetDef, "prefix" | "description" | "scope">> & { body?: string }): void {
  const files = snippetFiles().map(f => {
    if (f.name !== fileName) return f;
    const snippets = [...f.snippets];
    if (index < 0 || index >= snippets.length) return f;
    snippets[index] = {
      ...snippets[index],
      ...(updated.prefix !== undefined ? { prefix: updated.prefix } : {}),
      ...(updated.description !== undefined ? { description: updated.description } : {}),
      ...(updated.scope !== undefined ? { scope: updated.scope } : {}),
      ...(updated.body !== undefined ? { body: updated.body } : {}),
    };
    return { ...f, snippets };
  });
  setSnippetFiles(files);
  rebuildMap(files);
  saveToCache(files);
}

/** Add a new snippet to an existing file. */
export function addSnippetToFile(fileName: string, snippet: UserSnippetDef): void {
  const files = snippetFiles().map(f => {
    if (f.name !== fileName) return f;
    return { ...f, snippets: [...f.snippets, snippet] };
  });
  setSnippetFiles(files);
  rebuildMap(files);
  saveToCache(files);
}

/** Remove a single snippet from a file by index. */
export function removeSnippetFromFile(fileName: string, index: number): void {
  const files = snippetFiles().map(f => {
    if (f.name !== fileName) return f;
    const snippets = f.snippets.filter((_, i) => i !== index);
    return { ...f, snippets };
  });
  setSnippetFiles(files);
  rebuildMap(files);
  saveToCache(files);
}

// ── Initialize ──

loadCached();
