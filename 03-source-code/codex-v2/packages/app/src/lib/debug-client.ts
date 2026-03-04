// ============================================================================
// CodeEX v2 — Debug Client
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Debug session management: breakpoints, call stack, variables, stepping.
// Integrates with DAP (Debug Adapter Protocol) for real debugging via
// TerraRuntime. Falls back to simulated state when no adapter is available.
// Supports F5/F9/F10/F11 debug workflow.
// ============================================================================

import type { DebugBreakpoint, DebugStackFrame, DebugVariable, DebugSessionStatus } from "./types";
import { DapClient } from "./dap-client";
import {
  getSelectedLaunchConfig,
  getAdapterCommand,
  resolveVariables,
  loadLaunchConfigs,
} from "./debug-config";

// ============================================================================
// State
// ============================================================================

let sessionStatus: DebugSessionStatus = "idle";
let breakpoints: DebugBreakpoint[] = [];
let callStack: DebugStackFrame[] = [];
let variables: DebugVariable[] = [];
let currentFrame: DebugStackFrame | undefined;
let nextBreakpointId = 1;

// DAP state
let dapClient: DapClient | null = null;
let activeThreadId = 1;
let workspaceRoot = "";
let activeFilePath = "";
let frameScopes = new Map<number, number[]>(); // frameId → variablesReferences

// Listeners
const statusListeners: Array<() => void> = [];

function notifyListeners() {
  statusListeners.forEach((fn) => fn());
  document.dispatchEvent(new CustomEvent("codex:debug-state-changed", {
    detail: getDebugState(),
  }));
}

// ============================================================================
// Public API
// ============================================================================

export function getDebugState() {
  return {
    status: sessionStatus,
    breakpoints: [...breakpoints],
    callStack: [...callStack],
    variables: [...variables],
    currentFrame,
  };
}

export function getDebugStatus(): DebugSessionStatus {
  return sessionStatus;
}

export function getBreakpoints(): DebugBreakpoint[] {
  return [...breakpoints];
}

export function onDebugStateChange(fn: () => void): () => void {
  statusListeners.push(fn);
  return () => {
    const idx = statusListeners.indexOf(fn);
    if (idx >= 0) statusListeners.splice(idx, 1);
  };
}

/** Set workspace root for variable resolution. */
export function setDebugWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

/** Set the active file path for ${file} variable resolution. */
export function setDebugActiveFile(filePath: string): void {
  activeFilePath = filePath;
}

/** Get the DAP client instance (for watch expressions, REPL, etc.). */
export function getDapClient(): DapClient | null {
  return dapClient;
}

// ============================================================================
// Breakpoint Management
// ============================================================================

export function toggleBreakpoint(file: string, line: number): void {
  const existing = breakpoints.find((bp) => bp.file === file && bp.line === line);
  if (existing) {
    breakpoints = breakpoints.filter((bp) => bp !== existing);
  } else {
    breakpoints.push({
      id: `bp-${nextBreakpointId++}`,
      file,
      line,
      enabled: true,
    });
  }
  notifyListeners();

  // Sync breakpoints to DAP if connected
  if (dapClient?.connected) {
    syncBreakpointsToDAP(file);
  }
}

export function removeBreakpoint(id: string): void {
  const bp = breakpoints.find(b => b.id === id);
  breakpoints = breakpoints.filter((b) => b.id !== id);
  notifyListeners();

  if (bp && dapClient?.connected) {
    syncBreakpointsToDAP(bp.file);
  }
}

export function toggleBreakpointEnabled(id: string): void {
  const bp = breakpoints.find((b) => b.id === id);
  if (bp) {
    bp.enabled = !bp.enabled;
    notifyListeners();

    if (dapClient?.connected) {
      syncBreakpointsToDAP(bp.file);
    }
  }
}

export function clearAllBreakpoints(): void {
  const files = new Set(breakpoints.map(bp => bp.file));
  breakpoints = [];
  notifyListeners();

  // Clear breakpoints in DAP for all affected files
  if (dapClient?.connected) {
    for (const file of files) {
      syncBreakpointsToDAP(file);
    }
  }
}

/** Set or clear a condition expression on a breakpoint. */
export function setBreakpointCondition(id: string, condition: string): void {
  const bp = breakpoints.find(b => b.id === id);
  if (bp) {
    bp.condition = condition || undefined;
    notifyListeners();
    if (dapClient?.connected) syncBreakpointsToDAP(bp.file);
  }
}

/** Set or clear a hit count condition on a breakpoint. */
export function setBreakpointHitCondition(id: string, hitCondition: string): void {
  const bp = breakpoints.find(b => b.id === id);
  if (bp) {
    bp.hitCondition = hitCondition || undefined;
    notifyListeners();
    if (dapClient?.connected) syncBreakpointsToDAP(bp.file);
  }
}

/** Set or clear a log message (logpoint) on a breakpoint. */
export function setBreakpointLogMessage(id: string, logMessage: string): void {
  const bp = breakpoints.find(b => b.id === id);
  if (bp) {
    bp.logMessage = logMessage || undefined;
    notifyListeners();
    if (dapClient?.connected) syncBreakpointsToDAP(bp.file);
  }
}

export function getBreakpointsForFile(file: string): DebugBreakpoint[] {
  return breakpoints.filter((bp) => bp.file === file);
}

export function hasBreakpointAt(file: string, line: number): boolean {
  return breakpoints.some((bp) => bp.file === file && bp.line === line);
}

/** Sync breakpoints for a specific file to the DAP adapter. */
async function syncBreakpointsToDAP(file: string): Promise<void> {
  if (!dapClient?.connected) return;

  const fileBps = breakpoints
    .filter(bp => bp.file === file && bp.enabled)
    .map(bp => ({
      line: bp.line,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage,
    }));

  try {
    await dapClient.setBreakpoints(file, fileBps);
  } catch (err: any) {
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "warn", message: `Failed to sync breakpoints: ${err.message}` },
    }));
  }
}

// ============================================================================
// Session Control — DAP Wire Protocol
// ============================================================================

export async function startDebugSession(): Promise<void> {
  if (sessionStatus === "running" || sessionStatus === "paused") return;

  // Load launch configs if not already loaded
  if (!getSelectedLaunchConfig()) {
    await loadLaunchConfigs(workspaceRoot || undefined);
  }

  const config = getSelectedLaunchConfig();
  if (!config) {
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "error", message: "No debug configuration selected. Create a .codex/launch.json or .vscode/launch.json file." },
    }));
    return;
  }

  // Resolve variables in the config
  const resolved = resolveVariables(config, workspaceRoot, activeFilePath);

  // Get the adapter command
  const adapter = getAdapterCommand(config.type);
  if (!adapter) {
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "error", message: `No debug adapter available for type: ${config.type}` },
    }));
    // Fall back to simulated session
    startSimulatedSession();
    return;
  }

  sessionStatus = "running";
  callStack = [];
  variables = [];
  currentFrame = undefined;
  notifyListeners();

  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Debug", level: "info", message: `Starting debug session: ${config.name} (${config.type})` },
  }));

  try {
    // Create DAP client and connect
    dapClient = new DapClient();

    // Register event handlers before connecting
    registerDAPEventHandlers();

    await dapClient.connect(adapter.command, adapter.args, resolved.cwd ?? workspaceRoot);

    // Sync all breakpoints
    const bpFiles = new Set(breakpoints.map(bp => bp.file));
    for (const file of bpFiles) {
      await syncBreakpointsToDAP(file);
    }

    // Signal configuration done
    await dapClient.configurationDone();

    // Launch or attach
    if (resolved.request === "attach") {
      await dapClient.attach(resolved);
    } else {
      await dapClient.launch(resolved);
    }

    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "info", message: "Debug session connected" },
    }));
  } catch (err: any) {
    console.error("[Debug] Failed to start DAP session:", err);
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "error", message: `Debug adapter failed: ${err.message}. Falling back to simulated session.` },
    }));

    // Clean up failed DAP session
    dapClient = null;

    // Fall back to simulated session
    startSimulatedSession();
  }
}

function startSimulatedSession(): void {
  sessionStatus = "running";
  callStack = [];
  variables = [];
  currentFrame = undefined;
  notifyListeners();

  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Debug", level: "info", message: "Debug session started (simulated mode — no debug adapter found)" },
  }));
}

export async function stopDebugSession(): Promise<void> {
  if (dapClient?.connected) {
    try {
      await dapClient.terminate();
      await dapClient.disconnect(true);
    } catch {}
    dapClient = null;
  }

  sessionStatus = "stopped";
  callStack = [];
  variables = [];
  currentFrame = undefined;
  frameScopes.clear();
  notifyListeners();

  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Debug", level: "info", message: "Debug session stopped" },
  }));

  // Reset to idle after brief delay
  setTimeout(() => {
    sessionStatus = "idle";
    notifyListeners();
  }, 500);
}

export async function continueExecution(): Promise<void> {
  if (sessionStatus !== "paused") return;

  if (dapClient?.connected) {
    try {
      await dapClient.continue(activeThreadId);
    } catch (err: any) {
      document.dispatchEvent(new CustomEvent("codex:output-log", {
        detail: { channel: "Debug", level: "error", message: `Continue failed: ${err.message}` },
      }));
      return;
    }
  }

  sessionStatus = "running";
  currentFrame = undefined;
  notifyListeners();
}

export async function stepOver(): Promise<void> {
  if (sessionStatus !== "paused") return;

  if (dapClient?.connected) {
    try {
      await dapClient.next(activeThreadId);
    } catch (err: any) {
      document.dispatchEvent(new CustomEvent("codex:output-log", {
        detail: { channel: "Debug", level: "error", message: `Step Over failed: ${err.message}` },
      }));
      return;
    }
  }

  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Debug", level: "info", message: "Step Over" },
  }));
}

export async function stepInto(): Promise<void> {
  if (sessionStatus !== "paused") return;

  if (dapClient?.connected) {
    try {
      await dapClient.stepIn(activeThreadId);
    } catch (err: any) {
      document.dispatchEvent(new CustomEvent("codex:output-log", {
        detail: { channel: "Debug", level: "error", message: `Step Into failed: ${err.message}` },
      }));
      return;
    }
  }

  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Debug", level: "info", message: "Step Into" },
  }));
}

export async function stepOut(): Promise<void> {
  if (sessionStatus !== "paused") return;

  if (dapClient?.connected) {
    try {
      await dapClient.stepOut(activeThreadId);
    } catch (err: any) {
      document.dispatchEvent(new CustomEvent("codex:output-log", {
        detail: { channel: "Debug", level: "error", message: `Step Out failed: ${err.message}` },
      }));
      return;
    }
  }

  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Debug", level: "info", message: "Step Out" },
  }));
}

// ============================================================================
// DAP Event Handlers
// ============================================================================

function registerDAPEventHandlers(): void {
  if (!dapClient) return;

  // Initialized — adapter ready for breakpoints and launch
  dapClient.on("initialized", () => {
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "info", message: "Debug adapter initialized" },
    }));
  });

  // Stopped — breakpoint hit, step complete, exception, etc.
  dapClient.on("stopped", async (body: any) => {
    sessionStatus = "paused";
    activeThreadId = body?.threadId ?? 1;

    const reason = body?.reason ?? "unknown";
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "info", message: `Paused: ${reason}` },
    }));

    // Fetch call stack
    await fetchCallStack(activeThreadId);

    // Fetch variables for top frame
    if (callStack.length > 0) {
      currentFrame = callStack[0];
      await fetchVariables(currentFrame.id);
    }

    notifyListeners();

    // Emit breakpoint-hit event for editor highlighting
    if (currentFrame) {
      document.dispatchEvent(new CustomEvent("codex:debug-breakpoint-hit", {
        detail: { file: currentFrame.file, line: currentFrame.line },
      }));
    }
  });

  // Continued — execution resumed
  dapClient.on("continued", () => {
    sessionStatus = "running";
    currentFrame = undefined;
    notifyListeners();
  });

  // Terminated — debuggee exited
  dapClient.on("terminated", () => {
    stopDebugSession();
  });

  // Exited — process exit with code
  dapClient.on("exited", (body: any) => {
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "info", message: `Process exited with code ${body?.exitCode ?? "unknown"}` },
    }));
    stopDebugSession();
  });

  // Output — console output from debuggee
  dapClient.on("output", (body: any) => {
    const category = body?.category ?? "console";
    const text = body?.output ?? "";
    if (text.trim()) {
      document.dispatchEvent(new CustomEvent("codex:output-log", {
        detail: {
          channel: "Debug",
          level: category === "stderr" ? "error" : "info",
          message: text.trimEnd(),
        },
      }));
    }
  });

  // Thread — thread started/exited
  dapClient.on("thread", (body: any) => {
    const action = body?.reason ?? "unknown";
    document.dispatchEvent(new CustomEvent("codex:output-log", {
      detail: { channel: "Debug", level: "info", message: `Thread ${body?.threadId}: ${action}` },
    }));
  });
}

// ============================================================================
// Data Fetching from DAP
// ============================================================================

async function fetchCallStack(threadId: number): Promise<void> {
  if (!dapClient?.connected) return;

  try {
    const result = await dapClient.stackTrace(threadId);
    callStack = result.stackFrames.map(frame => ({
      id: frame.id,
      name: frame.name,
      file: frame.source?.path ?? frame.source?.name ?? "unknown",
      line: frame.line,
      column: frame.column,
    }));
  } catch {
    callStack = [];
  }
}

async function fetchVariables(frameId: number): Promise<void> {
  if (!dapClient?.connected) return;

  try {
    const scopes = await dapClient.scopes(frameId);
    const allVars: DebugVariable[] = [];
    const scopeRefs: number[] = [];

    for (const scope of scopes) {
      scopeRefs.push(scope.variablesReference);

      if (scope.expensive && scope.variablesReference > 0) {
        // Expensive scopes (like globals) — show as expandable without loading
        allVars.push({
          name: scope.name,
          value: "(click to expand)",
          type: "scope",
          children: [],
          expanded: false,
        });
        continue;
      }

      if (scope.variablesReference > 0) {
        const vars = await dapClient.variables(scope.variablesReference);
        for (const v of vars) {
          allVars.push(dapVarToDebugVar(v));
        }
      }
    }

    frameScopes.set(frameId, scopeRefs);
    variables = allVars;
  } catch {
    variables = [];
  }
}

function dapVarToDebugVar(v: { name: string; value: string; type?: string; variablesReference: number }): DebugVariable {
  return {
    name: v.name,
    value: v.value,
    type: v.type,
    children: v.variablesReference > 0 ? [] : undefined,
    expanded: false,
  };
}

/** Expand a variable's children by fetching from DAP. */
export async function expandVariable(name: string): Promise<DebugVariable[]> {
  if (!dapClient?.connected) return [];

  // Find the variable reference — for now search by name in the current scope
  // In a full implementation, we'd track variablesReference per variable
  try {
    if (currentFrame) {
      const scopes = await dapClient.scopes(currentFrame.id);
      for (const scope of scopes) {
        if (scope.variablesReference > 0) {
          const vars = await dapClient.variables(scope.variablesReference);
          const target = vars.find(v => v.name === name);
          if (target && target.variablesReference > 0) {
            const children = await dapClient.variables(target.variablesReference);
            return children.map(dapVarToDebugVar);
          }
        }
      }
    }
  } catch {}

  return [];
}

/** Evaluate an expression in the current debug context. */
export async function evaluateExpression(expression: string, context: "watch" | "repl" | "hover" = "watch"): Promise<{ result: string; type?: string } | null> {
  if (!dapClient?.connected || sessionStatus !== "paused") return null;

  try {
    const result = await dapClient.evaluate(expression, currentFrame?.id, context);
    return { result: result.result, type: result.type };
  } catch (err: any) {
    return { result: err.message ?? "Error", type: "error" };
  }
}

// ============================================================================
// Simulated Breakpoint Hit (for testing/demo when no adapter available)
// ============================================================================

export function simulateBreakpointHit(file: string, line: number): void {
  sessionStatus = "paused";
  currentFrame = { id: 0, name: "main", file, line, column: 1 };
  callStack = [
    currentFrame,
    { id: 1, name: "handleRequest", file, line: Math.max(1, line - 10), column: 1 },
    { id: 2, name: "processEvent", file, line: Math.max(1, line - 25), column: 1 },
  ];
  variables = [
    { name: "this", value: "Object", type: "object", children: [
      { name: "props", value: "{...}", type: "object" },
      { name: "state", value: "{...}", type: "object" },
    ]},
    { name: "args", value: "[]", type: "Array" },
    { name: "result", value: "undefined", type: "undefined" },
    { name: "count", value: "42", type: "number" },
    { name: "message", value: '"Hello World"', type: "string" },
  ];
  notifyListeners();

  document.dispatchEvent(new CustomEvent("codex:debug-breakpoint-hit", {
    detail: { file, line },
  }));
}
