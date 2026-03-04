// ============================================================================
// CodeEX v2 — LSP Client (Language Server Protocol)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Multi-server JSON-RPC 2.0 client for communicating with language servers
// via TerraRuntime. Manages concurrent server instances for TypeScript,
// Python (pylsp), and Rust (rust-analyzer). Handles initialize lifecycle,
// document sync, completions, hover, diagnostics, go-to-definition, rename,
// code actions, and signature help. Desktop-only (requires TerraRuntime).
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export type LspStatus = "stopped" | "starting" | "ready" | "error";

export interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: 1 | 2 | 3 | 4; // Error, Warning, Info, Hint
  code?: string | number;
  source?: string;
  message: string;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  insertTextFormat?: 1 | 2; // PlainText | Snippet
  textEdit?: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string };
}

export interface LspHover {
  contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface LspLocation {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface LspSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string | { kind: string; value: string };
    parameters?: Array<{ label: string | [number, number]; documentation?: string }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}

export interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number; // LSP SymbolKind enum
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
  children?: LspDocumentSymbol[];
}

export interface LspCodeAction {
  title: string;
  kind?: string;
  diagnostics?: LspDiagnostic[];
  isPreferred?: boolean;
  edit?: { changes?: Record<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>> };
  command?: { title: string; command: string; arguments?: any[] };
}

// LSP completion item kinds (for icon mapping)
export const CompletionItemKind: Record<number, string> = {
  1: "text", 2: "method", 3: "function", 4: "constructor", 5: "field",
  6: "variable", 7: "class", 8: "interface", 9: "module", 10: "property",
  11: "unit", 12: "value", 13: "enum", 14: "keyword", 15: "snippet",
  16: "color", 17: "file", 18: "reference", 19: "folder", 20: "enumMember",
  21: "constant", 22: "struct", 23: "event", 24: "operator", 25: "typeParameter",
};

// ============================================================================
// LSP Language Server Configuration
// ============================================================================

interface LspServerConfig {
  command: string;
  args: string[];
  languages: string[];
  initOptions?: Record<string, any>;
}

/** Known language server configurations. */
const SERVER_CONFIGS: Record<string, LspServerConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languages: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
  },
  python: {
    command: "pylsp",
    args: [],
    languages: ["python"],
    initOptions: {
      pylsp: {
        plugins: {
          pycodestyle: { enabled: true },
          pyflakes: { enabled: true },
          yapf: { enabled: false },
          autopep8: { enabled: false },
        },
      },
    },
  },
  rust: {
    command: "rust-analyzer",
    args: [],
    languages: ["rust"],
    initOptions: {
      checkOnSave: { command: "clippy" },
      cargo: { allFeatures: true },
      procMacro: { enable: true },
    },
  },
};

/** Map file extensions to LSP language IDs. */
function getLanguageId(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": return "typescript";
    case "tsx": return "typescriptreact";
    case "js": case "mjs": case "cjs": return "javascript";
    case "jsx": return "javascriptreact";
    case "py": return "python";
    case "rs": return "rust";
    case "json": return "json";
    case "css": case "scss": case "less": return "css";
    case "html": case "htm": return "html";
    default: return null;
  }
}

/** Determine which server config key handles a given language ID. */
function getServerKeyForLanguage(languageId: string): string | null {
  for (const [key, config] of Object.entries(SERVER_CONFIGS)) {
    if (config.languages.includes(languageId)) return key;
  }
  return null;
}

/** Determine which server config handles a given language ID. */
function getServerForLanguage(languageId: string): LspServerConfig | null {
  const key = getServerKeyForLanguage(languageId);
  return key ? SERVER_CONFIGS[key] : null;
}

// ============================================================================
// TerraRuntime Bridge
// ============================================================================

function getTerraRuntime(): any {
  return (window as any).__TAURI__;
}

function isTerraRuntime(): boolean {
  return !!getTerraRuntime()?.core?.invoke;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tr = getTerraRuntime();
  if (!tr?.core?.invoke) throw new Error("TerraRuntime not available");
  return tr.core.invoke(cmd, args);
}

function listen(event: string, handler: (payload: any) => void): () => void {
  const tr = getTerraRuntime();
  if (!tr?.event?.listen) return () => {};
  let unlisten: (() => void) | null = null;
  tr.event.listen(event, (ev: any) => handler(ev.payload)).then((fn: () => void) => {
    unlisten = fn;
  });
  return () => { unlisten?.(); };
}

// ============================================================================
// Per-Server Instance State
// ============================================================================

type RequestResolver = { resolve: (result: any) => void; reject: (err: any) => void };

interface ServerInstance {
  key: string;
  config: LspServerConfig;
  sessionId: string | null;
  status: LspStatus;
  pendingRequests: Map<number, RequestResolver>;
  openDocuments: Set<string>;
  documentVersions: Map<string, number>;
  serverCapabilities: any;
  unlistenMessage: (() => void) | null;
  unlistenStderr: (() => void) | null;
}

function createServerInstance(key: string, config: LspServerConfig): ServerInstance {
  return {
    key,
    config,
    sessionId: null,
    status: "stopped",
    pendingRequests: new Map(),
    openDocuments: new Set(),
    documentVersions: new Map(),
    serverCapabilities: null,
    unlistenMessage: null,
    unlistenStderr: null,
  };
}

// ============================================================================
// LSP Client Class — Multi-Server
// ============================================================================

type NotificationHandler = (params: any) => void;

export class LspClient {
  private servers = new Map<string, ServerInstance>();
  private nextRequestId = 1;
  private notificationHandlers = new Map<string, NotificationHandler[]>();
  private statusListeners: Array<(status: LspStatus) => void> = [];
  private rootPath: string | null = null;
  private rootUri: string | null = null;

  /** Get aggregate status — "ready" if any server is ready, "starting" if any starting, etc. */
  getStatus(): LspStatus {
    const statuses = [...this.servers.values()].map(s => s.status);
    if (statuses.includes("ready")) return "ready";
    if (statuses.includes("starting")) return "starting";
    if (statuses.includes("error")) return "error";
    return "stopped";
  }

  /** Get status of a specific language server. */
  getServerStatus(serverKey: string): LspStatus {
    return this.servers.get(serverKey)?.status ?? "stopped";
  }

  /** Get list of active server keys. */
  getActiveServers(): string[] {
    return [...this.servers.entries()]
      .filter(([_, s]) => s.status === "ready")
      .map(([k]) => k);
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(fn: (status: LspStatus) => void): () => void {
    this.statusListeners.push(fn);
    return () => { this.statusListeners = this.statusListeners.filter((f) => f !== fn); };
  }

  /** Register a handler for LSP notifications (e.g., textDocument/publishDiagnostics). */
  onNotification(method: string, handler: NotificationHandler): () => void {
    const handlers = this.notificationHandlers.get(method) ?? [];
    handlers.push(handler);
    this.notificationHandlers.set(method, handlers);
    return () => {
      const arr = this.notificationHandlers.get(method) ?? [];
      this.notificationHandlers.set(method, arr.filter((h) => h !== handler));
    };
  }

  private emitStatus() {
    const s = this.getStatus();
    this.statusListeners.forEach((fn) => fn(s));
    document.dispatchEvent(new CustomEvent("codex:lsp-status", {
      detail: {
        status: s,
        servers: Object.fromEntries(
          [...this.servers.entries()].map(([k, v]) => [k, v.status])
        ),
      },
    }));
  }

  // ========================================================================
  // Server Lifecycle
  // ========================================================================

  /** Start language servers for a given workspace root. Starts TypeScript immediately;
   *  Python and Rust start on-demand when a file of that language is opened. */
  async start(rootPath: string): Promise<void> {
    if (!isTerraRuntime()) return;
    this.rootPath = rootPath;
    this.rootUri = pathToUri(rootPath);

    // Start TypeScript server immediately (primary language)
    await this.startServer("typescript");
  }

  /** Start a specific language server by key. */
  async startServer(serverKey: string): Promise<void> {
    if (!isTerraRuntime() || !this.rootPath || !this.rootUri) return;

    const config = SERVER_CONFIGS[serverKey];
    if (!config) return;

    // Check if already running or starting
    const existing = this.servers.get(serverKey);
    if (existing && (existing.status === "ready" || existing.status === "starting")) return;

    const instance = createServerInstance(serverKey, config);
    instance.status = "starting";
    this.servers.set(serverKey, instance);
    this.emitStatus();

    try {
      // Spawn the LSP process via TerraRuntime
      instance.sessionId = await invoke<string>("lsp_spawn", {
        command: config.command,
        args: config.args,
        cwd: this.rootPath,
      });

      // Listen for LSP messages from this server
      instance.unlistenMessage = listen("lsp-message", (payload: { lspId: string; message: string }) => {
        if (payload.lspId === instance.sessionId) {
          this.handleMessage(instance, payload.message);
        }
      });

      instance.unlistenStderr = listen("lsp-stderr", (payload: { lspId: string; message: string }) => {
        if (payload.lspId === instance.sessionId) {
          document.dispatchEvent(new CustomEvent("codex:output-log", {
            detail: { channel: `LSP:${serverKey}`, level: "info", message: payload.message },
          }));
        }
      });

      // Send initialize request
      const initParams: any = {
        processId: null,
        rootUri: this.rootUri,
        capabilities: {
          textDocument: {
            synchronization: {
              openClose: true,
              change: 2, // Incremental
              willSave: false,
              didSave: { includeText: false },
            },
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ["markdown", "plaintext"],
                deprecatedSupport: true,
                labelDetailsSupport: true,
              },
              contextSupport: true,
            },
            hover: {
              contentFormat: ["markdown", "plaintext"],
            },
            signatureHelp: {
              signatureInformation: {
                documentationFormat: ["markdown", "plaintext"],
                parameterInformation: { labelOffsetSupport: true },
              },
            },
            definition: { linkSupport: false },
            references: {},
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
            },
            rename: { prepareSupport: true },
            codeAction: {
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: ["quickfix", "refactor", "source"],
                },
              },
            },
          },
          workspace: {
            workspaceFolders: true,
            configuration: true,
          },
        },
        workspaceFolders: [{ uri: this.rootUri, name: this.rootPath!.split(/[/\\]/).pop() ?? "workspace" }],
      };

      // Add server-specific init options
      if (config.initOptions) {
        initParams.initializationOptions = config.initOptions;
      }

      const initResult = await this.sendRequestToServer(instance, "initialize", initParams);
      instance.serverCapabilities = initResult?.capabilities;

      // Send initialized notification
      this.sendNotificationToServer(instance, "initialized", {});

      instance.status = "ready";
      this.servers.set(serverKey, instance);
      this.emitStatus();

      document.dispatchEvent(new CustomEvent("codex:output-log", {
        detail: { channel: `LSP:${serverKey}`, level: "info", message: `${serverKey} language server ready` },
      }));
    } catch (err: any) {
      console.error(`[LSP:${serverKey}] Failed to start:`, err);
      instance.status = "error";
      this.servers.set(serverKey, instance);
      this.emitStatus();
    }
  }

  /** Ensure the server for a language is running. Starts on-demand if needed. */
  private async ensureServer(languageId: string): Promise<ServerInstance | null> {
    const serverKey = getServerKeyForLanguage(languageId);
    if (!serverKey) return null;

    const instance = this.servers.get(serverKey);
    if (instance?.status === "ready") return instance;

    // Start on-demand
    if (!instance || instance.status === "stopped" || instance.status === "error") {
      await this.startServer(serverKey);
      return this.servers.get(serverKey) ?? null;
    }

    // If starting, wait briefly
    if (instance.status === "starting") {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          const s = this.servers.get(serverKey);
          if (s && s.status !== "starting") {
            clearInterval(check);
            resolve(s.status === "ready" ? s : null);
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(null); }, 15_000);
      });
    }

    return null;
  }

  /** Get the ready server instance for a file path. */
  private getServerForFile(filePath: string): ServerInstance | null {
    const langId = getLanguageId(filePath);
    if (!langId) return null;
    const serverKey = getServerKeyForLanguage(langId);
    if (!serverKey) return null;
    const instance = this.servers.get(serverKey);
    return instance?.status === "ready" ? instance : null;
  }

  /** Stop all language servers. */
  async stop(): Promise<void> {
    const stopPromises = [...this.servers.keys()].map(k => this.stopServer(k));
    await Promise.allSettled(stopPromises);
  }

  /** Stop a specific language server. */
  async stopServer(serverKey: string): Promise<void> {
    const instance = this.servers.get(serverKey);
    if (!instance?.sessionId) return;

    try {
      await this.sendRequestToServer(instance, "shutdown", null);
      this.sendNotificationToServer(instance, "exit", null);
    } catch {
      // Server may already be dead
    }

    try {
      await invoke("lsp_kill", { lspId: instance.sessionId });
    } catch {}

    this.cleanupServer(instance);
    this.servers.delete(serverKey);
    this.emitStatus();
  }

  private cleanupServer(instance: ServerInstance) {
    instance.unlistenMessage?.();
    instance.unlistenStderr?.();
    instance.sessionId = null;
    instance.pendingRequests.forEach(({ reject }) => reject(new Error("LSP stopped")));
    instance.pendingRequests.clear();
    instance.openDocuments.clear();
    instance.documentVersions.clear();
    instance.serverCapabilities = null;
    instance.status = "stopped";
  }

  // ========================================================================
  // JSON-RPC Message Handling (Per-Server)
  // ========================================================================

  private handleMessage(instance: ServerInstance, raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if ("id" in msg && ("result" in msg || "error" in msg)) {
      const resolver = instance.pendingRequests.get(msg.id);
      if (resolver) {
        instance.pendingRequests.delete(msg.id);
        if (msg.error) {
          resolver.reject(new Error(`LSP Error ${msg.error.code}: ${msg.error.message}`));
        } else {
          resolver.resolve(msg.result);
        }
      }
    } else if ("method" in msg && !("id" in msg)) {
      // Notification from the server — dispatch to handlers
      const handlers = this.notificationHandlers.get(msg.method);
      if (handlers) {
        handlers.forEach((h) => h(msg.params));
      }
    } else if ("method" in msg && "id" in msg) {
      this.handleServerRequest(instance, msg.id, msg.method, msg.params);
    }
  }

  private handleServerRequest(instance: ServerInstance, id: number, method: string, params: any) {
    if (method === "workspace/configuration") {
      const items = params?.items ?? [];
      const result = items.map((item: any) => {
        // Return server-specific config when available
        if (instance.config.initOptions && item.section) {
          return instance.config.initOptions[item.section] ?? {};
        }
        return {};
      });
      this.sendResponseToServer(instance, id, result);
    } else if (method === "client/registerCapability") {
      this.sendResponseToServer(instance, id, null);
    } else if (method === "window/workDoneProgress/create") {
      this.sendResponseToServer(instance, id, null);
    } else {
      this.sendResponseToServer(instance, id, null);
    }
  }

  private sendResponseToServer(instance: ServerInstance, id: number, result: any) {
    if (!instance.sessionId) return;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
    invoke("lsp_send", { lspId: instance.sessionId, message: msg }).catch(() => {});
  }

  private sendRequestToServer(instance: ServerInstance, method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!instance.sessionId) {
        reject(new Error("LSP not connected"));
        return;
      }
      const id = this.nextRequestId++;
      instance.pendingRequests.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      invoke("lsp_send", { lspId: instance.sessionId, message: msg }).catch((err) => {
        instance.pendingRequests.delete(id);
        reject(err);
      });

      // Timeout: 15s for initialize, 10s for everything else
      const timeout = method === "initialize" ? 15_000 : 10_000;
      setTimeout(() => {
        if (instance.pendingRequests.has(id)) {
          instance.pendingRequests.delete(id);
          reject(new Error(`LSP request timed out: ${method}`));
        }
      }, timeout);
    });
  }

  private sendNotificationToServer(instance: ServerInstance, method: string, params: any) {
    if (!instance.sessionId) return;
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    invoke("lsp_send", { lspId: instance.sessionId, message: msg }).catch(() => {});
  }

  // ========================================================================
  // Document Lifecycle — Routed to Correct Server
  // ========================================================================

  /** Notify the server that a document was opened. Starts server on-demand. */
  didOpen(filePath: string, content: string): void {
    const languageId = getLanguageId(filePath);
    if (!languageId) return;

    const serverKey = getServerKeyForLanguage(languageId);
    if (!serverKey) return;

    const instance = this.servers.get(serverKey);

    if (instance?.status === "ready") {
      this.doDidOpen(instance, filePath, languageId, content);
    } else if (!instance || instance.status === "stopped" || instance.status === "error") {
      // Start server on-demand, then open the document
      this.startServer(serverKey).then(() => {
        const started = this.servers.get(serverKey);
        if (started?.status === "ready") {
          this.doDidOpen(started, filePath, languageId, content);
        }
      });
    }
  }

  private doDidOpen(instance: ServerInstance, filePath: string, languageId: string, content: string) {
    const uri = pathToUri(filePath);
    if (instance.openDocuments.has(uri)) return;

    instance.openDocuments.add(uri);
    instance.documentVersions.set(uri, 1);

    this.sendNotificationToServer(instance, "textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text: content },
    });
  }

  /** Notify the server that a document was changed (full content sync). */
  didChange(filePath: string, content: string): void {
    const instance = this.getServerForFile(filePath);
    if (!instance) return;

    const uri = pathToUri(filePath);
    if (!instance.openDocuments.has(uri)) return;

    const version = (instance.documentVersions.get(uri) ?? 0) + 1;
    instance.documentVersions.set(uri, version);

    this.sendNotificationToServer(instance, "textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }

  /** Notify the server that a document was saved. */
  didSave(filePath: string): void {
    const instance = this.getServerForFile(filePath);
    if (!instance) return;

    const uri = pathToUri(filePath);
    if (!instance.openDocuments.has(uri)) return;

    this.sendNotificationToServer(instance, "textDocument/didSave", {
      textDocument: { uri },
    });
  }

  /** Notify the server that a document was closed. */
  didClose(filePath: string): void {
    const instance = this.getServerForFile(filePath);
    if (!instance) return;

    const uri = pathToUri(filePath);
    if (!instance.openDocuments.has(uri)) return;

    instance.openDocuments.delete(uri);
    instance.documentVersions.delete(uri);

    this.sendNotificationToServer(instance, "textDocument/didClose", {
      textDocument: { uri },
    });
  }

  /** Request document formatting from the LSP server. Returns formatted text or null. */
  async format(filePath: string): Promise<string | null> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return null;
    const uri = pathToUri(filePath);
    try {
      const edits = await this.sendRequestToServer(instance, "textDocument/formatting", {
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      });
      if (!edits || !Array.isArray(edits) || edits.length === 0) return null;
      // Apply text edits to get formatted content (simplified — full implementation would apply each edit)
      return null; // LSP edits need to be applied incrementally; return null for now to let fallback handle it
    } catch {
      return null;
    }
  }

  // ========================================================================
  // Language Features — Routed to Correct Server
  // ========================================================================

  /** Request completions at a position. */
  async completion(filePath: string, line: number, character: number): Promise<LspCompletionItem[]> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return [];
    try {
      const result = await this.sendRequestToServer(instance, "textDocument/completion", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
      });
      if (!result) return [];
      return Array.isArray(result) ? result : result.items ?? [];
    } catch {
      return [];
    }
  }

  /** Request hover information at a position. */
  async hover(filePath: string, line: number, character: number): Promise<LspHover | null> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return null;
    try {
      return await this.sendRequestToServer(instance, "textDocument/hover", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
      });
    } catch {
      return null;
    }
  }

  /** Request go-to-definition at a position. */
  async definition(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return [];
    try {
      const result = await this.sendRequestToServer(instance, "textDocument/definition", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
      });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    } catch {
      return [];
    }
  }

  /** Request signature help at a position. */
  async signatureHelp(filePath: string, line: number, character: number): Promise<LspSignatureHelp | null> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return null;
    try {
      return await this.sendRequestToServer(instance, "textDocument/signatureHelp", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
      });
    } catch {
      return null;
    }
  }

  /** Request references at a position. */
  async references(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return [];
    try {
      const result = await this.sendRequestToServer(instance, "textDocument/references", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
        context: { includeDeclaration: true },
      });
      return result ?? [];
    } catch {
      return [];
    }
  }

  /** Request rename preparation. */
  async prepareRename(filePath: string, line: number, character: number): Promise<any> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return null;
    try {
      return await this.sendRequestToServer(instance, "textDocument/prepareRename", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
      });
    } catch {
      return null;
    }
  }

  /** Execute rename. */
  async rename(filePath: string, line: number, character: number, newName: string): Promise<any> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return null;
    try {
      return await this.sendRequestToServer(instance, "textDocument/rename", {
        textDocument: { uri: pathToUri(filePath) },
        position: { line, character },
        newName,
      });
    } catch {
      return null;
    }
  }

  /** Request code actions at a range. */
  async codeAction(filePath: string, startLine: number, startChar: number, endLine: number, endChar: number, diagnostics: LspDiagnostic[] = []): Promise<LspCodeAction[]> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return [];
    try {
      const result = await this.sendRequestToServer(instance, "textDocument/codeAction", {
        textDocument: { uri: pathToUri(filePath) },
        range: {
          start: { line: startLine, character: startChar },
          end: { line: endLine, character: endChar },
        },
        context: { diagnostics },
      });
      if (!result) return [];
      return (result as any[]).map((item: any) => item as LspCodeAction);
    } catch {
      return [];
    }
  }

  /** Request document symbols (outline) for a file. */
  async documentSymbols(filePath: string): Promise<LspDocumentSymbol[]> {
    const instance = this.getServerForFile(filePath);
    if (!instance) return [];
    try {
      const result = await this.sendRequestToServer(instance, "textDocument/documentSymbol", {
        textDocument: { uri: pathToUri(filePath) },
      });
      if (!result) return [];
      return result as LspDocumentSymbol[];
    } catch {
      return [];
    }
  }

  /** Check if a language is supported by any configured server. */
  supportsLanguage(filePath: string): boolean {
    const langId = getLanguageId(filePath);
    if (!langId) return false;
    return !!getServerForLanguage(langId);
  }
}

// ============================================================================
// Utility: File path <-> URI conversion
// ============================================================================

function pathToUri(filePath: string): string {
  // Normalize backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, "/");
  // Ensure leading slash for Windows paths (C:/foo -> /C:/foo)
  if (/^[A-Za-z]:/.test(normalized)) {
    normalized = "/" + normalized;
  }
  return "file://" + encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

export function uriToPath(uri: string): string {
  let path = decodeURI(uri.replace("file://", ""));
  // Remove leading slash for Windows paths (/C:/foo -> C:/foo)
  if (/^\/[A-Za-z]:/.test(path)) {
    path = path.slice(1);
  }
  return path;
}

// ============================================================================
// Language Server Auto-Install Manager
// ============================================================================

export interface LspInstallInfo {
  serverKey: string;
  name: string;
  command: string;
  languages: string[];
  installMethods: {
    method: string;
    command: string;
    platform?: "win32" | "darwin" | "linux" | "all";
  }[];
  homepage: string;
  available: boolean | null; // null = not checked yet
}

const LSP_INSTALL_REGISTRY: Omit<LspInstallInfo, "available">[] = [
  {
    serverKey: "typescript",
    name: "TypeScript Language Server",
    command: "typescript-language-server",
    languages: ["TypeScript", "JavaScript"],
    installMethods: [
      { method: "npm", command: "npm install -g typescript-language-server typescript", platform: "all" },
      { method: "bun", command: "bun install -g typescript-language-server typescript", platform: "all" },
      { method: "pnpm", command: "pnpm install -g typescript-language-server typescript", platform: "all" },
    ],
    homepage: "https://github.com/typescript-language-server/typescript-language-server",
  },
  {
    serverKey: "python",
    name: "Python Language Server (pylsp)",
    command: "pylsp",
    languages: ["Python"],
    installMethods: [
      { method: "pip", command: "pip install python-lsp-server", platform: "all" },
      { method: "pipx", command: "pipx install python-lsp-server", platform: "all" },
      { method: "conda", command: "conda install -c conda-forge python-lsp-server", platform: "all" },
    ],
    homepage: "https://github.com/python-lsp/python-lsp-server",
  },
  {
    serverKey: "rust",
    name: "Rust Analyzer",
    command: "rust-analyzer",
    languages: ["Rust"],
    installMethods: [
      { method: "rustup", command: "rustup component add rust-analyzer", platform: "all" },
      { method: "brew", command: "brew install rust-analyzer", platform: "darwin" },
      { method: "scoop", command: "scoop install rust-analyzer", platform: "win32" },
    ],
    homepage: "https://rust-analyzer.github.io",
  },
];

let serverAvailabilityCache = new Map<string, boolean>();
let autoInstallPrompted = new Set<string>();

/** Check if a language server binary is available on PATH. */
export async function checkServerAvailable(serverKey: string): Promise<boolean> {
  if (serverAvailabilityCache.has(serverKey)) {
    return serverAvailabilityCache.get(serverKey)!;
  }

  if (!isTerraRuntime()) {
    // In browser mode, can't check — assume unavailable
    serverAvailabilityCache.set(serverKey, false);
    return false;
  }

  const config = SERVER_CONFIGS[serverKey];
  if (!config) {
    serverAvailabilityCache.set(serverKey, false);
    return false;
  }

  try {
    const available = await invoke<boolean>("lsp_check_available", { command: config.command });
    serverAvailabilityCache.set(serverKey, available);
    return available;
  } catch {
    // If the check command doesn't exist yet in TerraRuntime, try starting the server as a test
    serverAvailabilityCache.set(serverKey, false);
    return false;
  }
}

/** Get install info for all configured language servers. */
export function getLspInstallRegistry(): LspInstallInfo[] {
  return LSP_INSTALL_REGISTRY.map(info => ({
    ...info,
    available: serverAvailabilityCache.get(info.serverKey) ?? null,
  }));
}

/** Get install info for a specific server. */
export function getLspInstallInfo(serverKey: string): LspInstallInfo | undefined {
  const info = LSP_INSTALL_REGISTRY.find(r => r.serverKey === serverKey);
  if (!info) return undefined;
  return { ...info, available: serverAvailabilityCache.get(serverKey) ?? null };
}

/** Check all servers and emit a notification for any that are missing. */
export async function checkAllServersAndNotify(): Promise<void> {
  if (!isTerraRuntime()) return;

  for (const info of LSP_INSTALL_REGISTRY) {
    const available = await checkServerAvailable(info.serverKey);
    if (!available && !autoInstallPrompted.has(info.serverKey)) {
      autoInstallPrompted.add(info.serverKey);
      document.dispatchEvent(new CustomEvent("codex:lsp-server-missing", {
        detail: {
          serverKey: info.serverKey,
          name: info.name,
          command: info.command,
          languages: info.languages,
          installMethods: info.installMethods,
        },
      }));
      document.dispatchEvent(new CustomEvent("codex:notification", {
        detail: {
          type: "warning",
          message: `${info.name} not found. Install with: ${info.installMethods[0]?.command ?? "see documentation"}`,
          duration: 10000,
        },
      }));
    }
  }
}

/** Attempt to install a language server via the terminal. */
export function requestServerInstall(serverKey: string, methodIndex: number = 0): void {
  const info = LSP_INSTALL_REGISTRY.find(r => r.serverKey === serverKey);
  if (!info) return;

  const method = info.installMethods[methodIndex];
  if (!method) return;

  // Emit terminal command execution request
  document.dispatchEvent(new CustomEvent("codex:terminal-execute", {
    detail: { command: method.command },
  }));

  document.dispatchEvent(new CustomEvent("codex:notification", {
    detail: {
      type: "info",
      message: `Installing ${info.name} via ${method.method}...`,
      duration: 5000,
    },
  }));
}

/** Clear availability cache and re-check. */
export function resetServerAvailabilityCache(): void {
  serverAvailabilityCache.clear();
  autoInstallPrompted.clear();
}

/** Get a summary of all server statuses for UI display. */
export function getLspServerSummary(): { key: string; name: string; available: boolean | null; status: LspStatus }[] {
  const client = getLspClient();
  return LSP_INSTALL_REGISTRY.map(info => ({
    key: info.serverKey,
    name: info.name,
    available: serverAvailabilityCache.get(info.serverKey) ?? null,
    status: client.getServerStatus(info.serverKey),
  }));
}

// ============================================================================
// Singleton Instance
// ============================================================================

let lspClientInstance: LspClient | null = null;

export function getLspClient(): LspClient {
  if (!lspClientInstance) {
    lspClientInstance = new LspClient();
  }
  return lspClientInstance;
}
