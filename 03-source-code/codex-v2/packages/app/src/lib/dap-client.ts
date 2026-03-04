// ============================================================================
// CodeEX v2 — DAP Client (Debug Adapter Protocol)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Wire protocol client for communicating with debug adapters via TerraRuntime.
// Uses the same stdio + Content-Length framing as LSP (reuses lsp_spawn/send/kill).
// Supports Node.js (js-debug), Python (debugpy), and Rust (codelldb) adapters.
// ============================================================================

// ============================================================================
// DAP Message Types
// ============================================================================

export interface DapMessage {
  seq: number;
  type: "request" | "response" | "event";
}

export interface DapRequest extends DapMessage {
  type: "request";
  command: string;
  arguments?: any;
}

export interface DapResponse extends DapMessage {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: any;
}

export interface DapEvent extends DapMessage {
  type: "event";
  event: string;
  body?: any;
}

// ── DAP Capability Types ──

export interface DapCapabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  supportsStepBack?: boolean;
  supportsSetVariable?: boolean;
  supportsRestartFrame?: boolean;
  supportsGotoTargetsRequest?: boolean;
  supportsStepInTargetsRequest?: boolean;
  supportsCompletionsRequest?: boolean;
  supportsModulesRequest?: boolean;
  supportsRestartRequest?: boolean;
  supportsExceptionOptions?: boolean;
  supportsValueFormattingOptions?: boolean;
  supportsExceptionInfoRequest?: boolean;
  supportTerminateDebuggee?: boolean;
  supportsDelayedStackTraceLoading?: boolean;
  supportsLoadedSourcesRequest?: boolean;
  supportsLogPoints?: boolean;
  supportsTerminateThreadsRequest?: boolean;
  supportsSetExpression?: boolean;
  supportsTerminateRequest?: boolean;
  supportsReadMemoryRequest?: boolean;
  supportsWriteMemoryRequest?: boolean;
  supportsDisassembleRequest?: boolean;
  supportsCancelRequest?: boolean;
  supportsClipboardContext?: boolean;
  supportsSteppingGranularity?: boolean;
  supportsInstructionBreakpoints?: boolean;
  supportsExceptionFilterOptions?: boolean;
  supportsSingleThreadExecutionRequests?: boolean;
}

export interface DapBreakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: { name?: string; path?: string };
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface DapStackFrame {
  id: number;
  name: string;
  source?: { name?: string; path?: string; sourceReference?: number };
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  moduleId?: number | string;
}

export interface DapScope {
  name: string;
  presentationHint?: "arguments" | "locals" | "registers" | string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: { name?: string; path?: string };
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface DapVariable {
  name: string;
  value: string;
  type?: string;
  presentationHint?: any;
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface DapThread {
  id: number;
  name: string;
}

// ============================================================================
// TerraRuntime Bridge (reuses LSP commands — same Content-Length framing)
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
// Debug Adapter Configuration
// ============================================================================

export interface DebugAdapterConfig {
  type: string;
  command: string;
  args: string[];
}

/** Known debug adapter configurations by type. */
const ADAPTER_CONFIGS: Record<string, DebugAdapterConfig> = {
  node: {
    type: "node",
    command: "node",
    args: ["--inspect-brk=0"],
  },
  "pwa-node": {
    type: "pwa-node",
    command: "js-debug-adapter",
    args: [],
  },
  python: {
    type: "python",
    command: "python",
    args: ["-m", "debugpy.adapter"],
  },
  lldb: {
    type: "lldb",
    command: "lldb-vscode",
    args: [],
  },
  codelldb: {
    type: "codelldb",
    command: "codelldb",
    args: ["--port", "0"],
  },
};

export function getAdapterConfig(type: string): DebugAdapterConfig | null {
  return ADAPTER_CONFIGS[type] ?? null;
}

// ============================================================================
// DAP Client
// ============================================================================

type ResponseResolver = { resolve: (body: any) => void; reject: (err: Error) => void };
type EventHandler = (body: any) => void;

export class DapClient {
  private sessionId: string | null = null;
  private seq = 1;
  private pendingResponses = new Map<number, ResponseResolver>();
  private eventHandlers = new Map<string, EventHandler[]>();
  private unlistenMessage: (() => void) | null = null;
  private unlistenStderr: (() => void) | null = null;
  private capabilities: DapCapabilities = {};
  private _connected = false;

  get connected(): boolean { return this._connected; }
  get serverCapabilities(): DapCapabilities { return this.capabilities; }

  /** Register an event handler for DAP events. */
  on(event: string, handler: EventHandler): () => void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
    return () => {
      const arr = this.eventHandlers.get(event) ?? [];
      this.eventHandlers.set(event, arr.filter(h => h !== handler));
    };
  }

  /** Spawn and initialize a debug adapter. */
  async connect(adapterCommand: string, adapterArgs: string[], cwd: string): Promise<DapCapabilities> {
    if (!isTerraRuntime()) throw new Error("TerraRuntime not available");
    if (this._connected) throw new Error("Already connected");

    // Spawn debug adapter via TerraRuntime (reuses LSP spawn — same stdio framing)
    this.sessionId = await invoke<string>("lsp_spawn", {
      command: adapterCommand,
      args: adapterArgs,
      cwd,
    });

    // Listen for DAP messages
    this.unlistenMessage = listen("lsp-message", (payload: { lspId: string; message: string }) => {
      if (payload.lspId === this.sessionId) {
        this.handleMessage(payload.message);
      }
    });

    this.unlistenStderr = listen("lsp-stderr", (payload: { lspId: string; message: string }) => {
      if (payload.lspId === this.sessionId) {
        document.dispatchEvent(new CustomEvent("codex:output-log", {
          detail: { channel: "Debug Adapter", level: "info", message: payload.message },
        }));
      }
    });

    // Send initialize request
    const initResult = await this.sendRequest("initialize", {
      clientID: "codex",
      clientName: "CodeEX",
      adapterID: "codex-debug",
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: false,
      supportsRunInTerminalRequest: false,
      supportsMemoryReferences: false,
      supportsProgressReporting: false,
      supportsInvalidatedEvent: false,
      supportsMemoryEvent: false,
      locale: "en-US",
    });

    this.capabilities = initResult ?? {};
    this._connected = true;
    return this.capabilities;
  }

  /** Launch a program for debugging. */
  async launch(config: Record<string, any>): Promise<void> {
    await this.sendRequest("launch", config);
  }

  /** Attach to a running program. */
  async attach(config: Record<string, any>): Promise<void> {
    await this.sendRequest("attach", config);
  }

  /** Signal that configuration is done (breakpoints set, ready to run). */
  async configurationDone(): Promise<void> {
    if (this.capabilities.supportsConfigurationDoneRequest) {
      await this.sendRequest("configurationDone", {});
    }
  }

  /** Set breakpoints for a source file. Returns verified breakpoints. */
  async setBreakpoints(
    path: string,
    breakpoints: Array<{ line: number; condition?: string; hitCondition?: string; logMessage?: string }>
  ): Promise<DapBreakpoint[]> {
    const result = await this.sendRequest("setBreakpoints", {
      source: { path },
      breakpoints,
      sourceModified: false,
    });
    return result?.breakpoints ?? [];
  }

  /** Set function breakpoints. */
  async setFunctionBreakpoints(
    breakpoints: Array<{ name: string; condition?: string; hitCondition?: string }>
  ): Promise<DapBreakpoint[]> {
    if (!this.capabilities.supportsFunctionBreakpoints) return [];
    const result = await this.sendRequest("setFunctionBreakpoints", { breakpoints });
    return result?.breakpoints ?? [];
  }

  /** Continue execution. */
  async continue(threadId: number): Promise<boolean> {
    const result = await this.sendRequest("continue", { threadId });
    return result?.allThreadsContinued ?? true;
  }

  /** Step over (next). */
  async next(threadId: number, granularity?: "statement" | "line" | "instruction"): Promise<void> {
    await this.sendRequest("next", { threadId, granularity });
  }

  /** Step into. */
  async stepIn(threadId: number, granularity?: "statement" | "line" | "instruction"): Promise<void> {
    await this.sendRequest("stepIn", { threadId, granularity });
  }

  /** Step out. */
  async stepOut(threadId: number, granularity?: "statement" | "line" | "instruction"): Promise<void> {
    await this.sendRequest("stepOut", { threadId, granularity });
  }

  /** Pause execution. */
  async pause(threadId: number): Promise<void> {
    await this.sendRequest("pause", { threadId });
  }

  /** Get threads. */
  async threads(): Promise<DapThread[]> {
    const result = await this.sendRequest("threads", {});
    return result?.threads ?? [];
  }

  /** Get stack trace for a thread. */
  async stackTrace(threadId: number, startFrame = 0, levels = 20): Promise<{ stackFrames: DapStackFrame[]; totalFrames?: number }> {
    const result = await this.sendRequest("stackTrace", {
      threadId,
      startFrame,
      levels,
    });
    return { stackFrames: result?.stackFrames ?? [], totalFrames: result?.totalFrames };
  }

  /** Get scopes for a stack frame. */
  async scopes(frameId: number): Promise<DapScope[]> {
    const result = await this.sendRequest("scopes", { frameId });
    return result?.scopes ?? [];
  }

  /** Get variables for a scope or variable reference. */
  async variables(variablesReference: number, start?: number, count?: number): Promise<DapVariable[]> {
    const args: any = { variablesReference };
    if (start !== undefined) args.start = start;
    if (count !== undefined) args.count = count;
    const result = await this.sendRequest("variables", args);
    return result?.variables ?? [];
  }

  /** Evaluate an expression in the context of a stack frame. */
  async evaluate(expression: string, frameId?: number, context?: "watch" | "repl" | "hover" | "clipboard"): Promise<{ result: string; type?: string; variablesReference: number }> {
    const args: any = { expression, context: context ?? "watch" };
    if (frameId !== undefined) args.frameId = frameId;
    const result = await this.sendRequest("evaluate", args);
    return {
      result: result?.result ?? "",
      type: result?.type,
      variablesReference: result?.variablesReference ?? 0,
    };
  }

  /** Terminate the debuggee. */
  async terminate(): Promise<void> {
    if (this.capabilities.supportsTerminateRequest) {
      try {
        await this.sendRequest("terminate", { restart: false });
      } catch {}
    }
  }

  /** Disconnect from the debug adapter. */
  async disconnect(terminateDebuggee = true): Promise<void> {
    try {
      await this.sendRequest("disconnect", {
        restart: false,
        terminateDebuggee,
      });
    } catch {}

    // Kill the adapter process
    if (this.sessionId) {
      try {
        await invoke("lsp_kill", { lspId: this.sessionId });
      } catch {}
    }

    this.cleanup();
  }

  private cleanup() {
    this.unlistenMessage?.();
    this.unlistenStderr?.();
    this.sessionId = null;
    this._connected = false;
    this.pendingResponses.forEach(({ reject }) => reject(new Error("DAP disconnected")));
    this.pendingResponses.clear();
    this.eventHandlers.clear();
    this.capabilities = {};
  }

  // ========================================================================
  // Message Handling
  // ========================================================================

  private handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "response") {
      this.handleResponse(msg as DapResponse);
    } else if (msg.type === "event") {
      this.handleEvent(msg as DapEvent);
    }
  }

  private handleResponse(response: DapResponse) {
    const resolver = this.pendingResponses.get(response.request_seq);
    if (!resolver) return;
    this.pendingResponses.delete(response.request_seq);

    if (response.success) {
      resolver.resolve(response.body);
    } else {
      resolver.reject(new Error(response.message ?? `DAP request failed: ${response.command}`));
    }
  }

  private handleEvent(event: DapEvent) {
    const handlers = this.eventHandlers.get(event.event);
    if (handlers) {
      handlers.forEach(h => h(event.body));
    }

    // Also emit as custom DOM event for loose coupling
    document.dispatchEvent(new CustomEvent(`codex:dap-${event.event}`, {
      detail: event.body,
    }));
  }

  private sendRequest(command: string, args?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.sessionId) {
        reject(new Error("DAP not connected"));
        return;
      }

      const seq = this.seq++;
      this.pendingResponses.set(seq, { resolve, reject });

      const msg: DapRequest = {
        seq,
        type: "request",
        command,
        arguments: args,
      };

      const json = JSON.stringify(msg);
      invoke("lsp_send", { lspId: this.sessionId, message: json }).catch((err) => {
        this.pendingResponses.delete(seq);
        reject(err);
      });

      // Timeout: 30s for launch/attach, 10s for everything else
      const timeout = (command === "launch" || command === "attach" || command === "initialize") ? 30_000 : 10_000;
      setTimeout(() => {
        if (this.pendingResponses.has(seq)) {
          this.pendingResponses.delete(seq);
          reject(new Error(`DAP request timed out: ${command}`));
        }
      }, timeout);
    });
  }
}
