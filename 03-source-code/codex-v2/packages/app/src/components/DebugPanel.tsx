// ============================================================================
// CodeEX v2 — Debug Panel
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Debug controls, call stack, variables inspector, breakpoints list.
// Bottom panel tab alongside Terminal, Problems, Output.
// ============================================================================

import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import {
  getDebugState,
  onDebugStateChange,
  startDebugSession,
  stopDebugSession,
  continueExecution,
  stepOver,
  stepInto,
  stepOut,
  removeBreakpoint,
  toggleBreakpointEnabled,
  clearAllBreakpoints,
  evaluateExpression,
  setBreakpointCondition,
  setBreakpointHitCondition,
  setBreakpointLogMessage,
} from "~/lib/debug-client";
import { launchConfigs, selectedConfig, setSelectedConfig } from "~/lib/debug-config";
import type { DebugBreakpoint, DebugStackFrame, DebugVariable, DebugSessionStatus } from "~/lib/types";

interface WatchEntry {
  id: number;
  expression: string;
  result: string;
  type?: string;
  error: boolean;
}

interface Props {
  visible: boolean;
  height?: number;
  onOpenFile?: (path: string, line?: number) => void;
}

export function DebugPanel(props: Props) {
  const [status, setStatus] = createSignal<DebugSessionStatus>("idle");
  const [callStack, setCallStack] = createSignal<DebugStackFrame[]>([]);
  const [variables, setVariables] = createSignal<DebugVariable[]>([]);
  const [breakpoints, setBreakpoints] = createSignal<DebugBreakpoint[]>([]);
  const [currentFrame, setCurrentFrame] = createSignal<DebugStackFrame | undefined>();
  const [expandedVars, setExpandedVars] = createSignal<Set<string>>(new Set());
  const [activeSection, setActiveSection] = createSignal<"variables" | "callstack" | "breakpoints" | "watch" | "console">("variables");
  const [watchEntries, setWatchEntries] = createSignal<WatchEntry[]>([]);
  const [watchInput, setWatchInput] = createSignal("");
  const [editingWatch, setEditingWatch] = createSignal<number | null>(null);
  const [stackFilter, setStackFilter] = createSignal("");
  const [showExternalFrames, setShowExternalFrames] = createSignal(true);
  let nextWatchId = 1;

  // Debug Console REPL state
  interface ConsoleEntry {
    id: number;
    type: "input" | "output" | "error" | "info";
    text: string;
    timestamp: number;
  }
  const [consoleEntries, setConsoleEntries] = createSignal<ConsoleEntry[]>([]);
  const [consoleInput, setConsoleInput] = createSignal("");
  const [consoleHistory, setConsoleHistory] = createSignal<string[]>([]);
  const [historyIndex, setHistoryIndex] = createSignal(-1);
  let nextConsoleId = 1;
  let consoleEndRef: HTMLDivElement | undefined;

  // Conditional breakpoint editor state
  type ConditionType = "expression" | "hitCount" | "logMessage";
  const [editingBpId, setEditingBpId] = createSignal<string | null>(null);
  const [conditionType, setConditionType] = createSignal<ConditionType>("expression");
  const [conditionInput, setConditionInput] = createSignal("");

  const startEditCondition = (bp: DebugBreakpoint, type?: ConditionType) => {
    setEditingBpId(bp.id);
    const t = type ?? (bp.logMessage ? "logMessage" : bp.hitCondition ? "hitCount" : "expression");
    setConditionType(t);
    setConditionInput(
      t === "expression" ? (bp.condition ?? "") :
      t === "hitCount" ? (bp.hitCondition ?? "") :
      (bp.logMessage ?? "")
    );
  };

  const saveCondition = (bpId: string) => {
    const value = conditionInput().trim();
    const type = conditionType();
    // Clear all condition fields first, then set the active one
    setBreakpointCondition(bpId, type === "expression" ? value : "");
    setBreakpointHitCondition(bpId, type === "hitCount" ? value : "");
    setBreakpointLogMessage(bpId, type === "logMessage" ? value : "");
    setEditingBpId(null);
  };

  const cancelEditCondition = () => {
    setEditingBpId(null);
  };

  const getConditionLabel = (bp: DebugBreakpoint): string | null => {
    if (bp.condition) return `Condition: ${bp.condition}`;
    if (bp.hitCondition) return `Hit Count: ${bp.hitCondition}`;
    if (bp.logMessage) return `Log: ${bp.logMessage}`;
    return null;
  };

  const syncState = () => {
    const state = getDebugState();
    setStatus(state.status);
    setCallStack(state.callStack);
    setVariables(state.variables);
    setBreakpoints(state.breakpoints);
    setCurrentFrame(state.currentFrame);
  };

  // Subscribe to debug state changes
  const unsub = onDebugStateChange(syncState);
  onCleanup(unsub);

  // Initial sync
  syncState();

  // Re-evaluate all watch expressions when debug state changes (paused with new frame)
  createEffect(() => {
    if (status() === "paused" && watchEntries().length > 0) {
      evaluateAllWatches();
    }
  });

  const addWatch = (expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed) return;
    const entry: WatchEntry = {
      id: nextWatchId++,
      expression: trimmed,
      result: status() === "paused" ? "evaluating..." : "not available",
      error: false,
    };
    setWatchEntries(prev => [...prev, entry]);
    setWatchInput("");

    // Evaluate immediately if paused
    if (status() === "paused") {
      evaluateWatch(entry.id, trimmed);
    }
  };

  const removeWatch = (id: number) => {
    setWatchEntries(prev => prev.filter(w => w.id !== id));
  };

  const editWatch = (id: number, newExpr: string) => {
    const trimmed = newExpr.trim();
    if (!trimmed) {
      removeWatch(id);
      return;
    }
    setWatchEntries(prev => prev.map(w =>
      w.id === id ? { ...w, expression: trimmed, result: "evaluating...", error: false } : w
    ));
    setEditingWatch(null);
    if (status() === "paused") {
      evaluateWatch(id, trimmed);
    }
  };

  const evaluateWatch = async (id: number, expression: string) => {
    const result = await evaluateExpression(expression, "watch");
    if (result) {
      setWatchEntries(prev => prev.map(w =>
        w.id === id ? { ...w, result: result.result, type: result.type, error: result.type === "error" } : w
      ));
    } else {
      setWatchEntries(prev => prev.map(w =>
        w.id === id ? { ...w, result: "not available", error: false } : w
      ));
    }
  };

  const evaluateAllWatches = async () => {
    for (const entry of watchEntries()) {
      await evaluateWatch(entry.id, entry.expression);
    }
  };

  // Debug Console REPL methods
  const addConsoleEntry = (type: ConsoleEntry["type"], text: string) => {
    setConsoleEntries(prev => [...prev, { id: nextConsoleId++, type, text, timestamp: Date.now() }]);
    // Auto-scroll to bottom
    setTimeout(() => consoleEndRef?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const executeConsoleCommand = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Add to history
    setConsoleHistory(prev => {
      const next = prev.filter(h => h !== trimmed);
      next.push(trimmed);
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIndex(-1);
    setConsoleInput("");

    // Log input
    addConsoleEntry("input", trimmed);

    // Handle special commands
    if (trimmed === "clear" || trimmed === ".clear") {
      setConsoleEntries([]);
      return;
    }
    if (trimmed === "help" || trimmed === ".help") {
      addConsoleEntry("info", "Debug Console Commands:");
      addConsoleEntry("info", "  .clear     Clear console output");
      addConsoleEntry("info", "  .help      Show this help");
      addConsoleEntry("info", "  .stack     Show current call stack");
      addConsoleEntry("info", "  .vars      Show variables in current scope");
      addConsoleEntry("info", "  Any other input is evaluated as an expression in the current debug context.");
      return;
    }
    if (trimmed === ".stack") {
      if (callStack().length === 0) {
        addConsoleEntry("info", "No call stack (not paused)");
      } else {
        for (const frame of callStack()) {
          addConsoleEntry("info", `  ${frame.name} (${frame.file.split("/").pop()}:${frame.line})`);
        }
      }
      return;
    }
    if (trimmed === ".vars") {
      if (variables().length === 0) {
        addConsoleEntry("info", "No variables in scope");
      } else {
        for (const v of variables()) {
          addConsoleEntry("info", `  ${v.name}: ${v.value}${v.type ? ` (${v.type})` : ""}`);
        }
      }
      return;
    }

    // Evaluate expression via DAP
    if (status() !== "paused") {
      addConsoleEntry("error", "Cannot evaluate: debugger is not paused");
      return;
    }

    const result = await evaluateExpression(trimmed, "repl");
    if (result) {
      if (result.type === "error") {
        addConsoleEntry("error", result.result);
      } else {
        const typeInfo = result.type ? ` [${result.type}]` : "";
        addConsoleEntry("output", `${result.result}${typeInfo}`);
      }
    } else {
      addConsoleEntry("error", "Evaluation failed — no response from debug adapter");
    }
  };

  const handleConsoleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeConsoleCommand(consoleInput());
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const history = consoleHistory();
      if (history.length === 0) return;
      const idx = historyIndex() === -1 ? history.length - 1 : Math.max(0, historyIndex() - 1);
      setHistoryIndex(idx);
      setConsoleInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const history = consoleHistory();
      if (historyIndex() === -1) return;
      const idx = historyIndex() + 1;
      if (idx >= history.length) {
        setHistoryIndex(-1);
        setConsoleInput("");
      } else {
        setHistoryIndex(idx);
        setConsoleInput(history[idx]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setConsoleEntries([]);
    }
  };

  // Listen for debuggee output events to show in console
  const handleDebugOutput = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.channel === "Debug Adapter" || detail?.channel === "stdout" || detail?.channel === "stderr") {
      addConsoleEntry(detail.channel === "stderr" ? "error" : "info", detail.message ?? "");
    }
  };
  document.addEventListener("codex:output-log", handleDebugOutput);
  onCleanup(() => document.removeEventListener("codex:output-log", handleDebugOutput));

  const toggleVarExpand = (name: string) => {
    setExpandedVars((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const renderVariable = (v: DebugVariable, depth: number = 0) => (
    <div class="debug-var-row" style={{ "padding-left": `${12 + depth * 16}px` }}>
      <Show when={v.children && v.children.length > 0}>
        <span
          class="debug-var-expand"
          onClick={() => toggleVarExpand(v.name)}
        >
          {expandedVars().has(v.name) ? "\u25BE" : "\u25B8"}
        </span>
      </Show>
      <span class="debug-var-name">{v.name}</span>
      <span class="debug-var-sep">:</span>
      <span class={`debug-var-value ${v.type ?? ""}`}>{v.value}</span>
      <Show when={v.type}>
        <span class="debug-var-type">{v.type}</span>
      </Show>
    </div>
  );

  const navigateToFrame = (frame: DebugStackFrame) => {
    props.onOpenFile?.(frame.file, frame.line);
  };

  // Call stack filtering: filter by function name or module, optionally hide external/library frames
  const isExternalFrame = (frame: DebugStackFrame): boolean => {
    const path = frame.file.replace(/\\/g, "/").toLowerCase();
    return path.includes("/node_modules/") || path.includes("/.cargo/") ||
           path.includes("/site-packages/") || path.includes("/dist-packages/") ||
           path.includes("/<anonymous>") || path.includes("/internal/") ||
           path.startsWith("node:") || path === "<unknown>" || path === "";
  };

  const filteredCallStack = (): DebugStackFrame[] => {
    let frames = callStack();
    if (!showExternalFrames()) {
      frames = frames.filter(f => !isExternalFrame(f));
    }
    const filter = stackFilter().trim().toLowerCase();
    if (filter) {
      frames = frames.filter(f =>
        f.name.toLowerCase().includes(filter) ||
        f.file.toLowerCase().includes(filter)
      );
    }
    return frames;
  };

  return (
    <div
      class="debug-panel"
      style={{
        display: props.visible ? "flex" : "none",
        height: props.height ? `${props.height}px` : "200px",
      }}
    >
      {/* Toolbar */}
      <div class="debug-toolbar">
        <div class="debug-toolbar-left">
          <div class="debug-controls">
            <Show when={status() === "idle" || status() === "stopped"}>
              <button class="debug-btn start" onClick={startDebugSession} title="Start Debugging (F5)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
              </button>
            </Show>
            <Show when={status() === "running"}>
              <button class="debug-btn pause" onClick={stopDebugSession} title="Stop Debugging (Shift+F5)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
              </button>
            </Show>
            <Show when={status() === "paused"}>
              <button class="debug-btn continue" onClick={continueExecution} title="Continue (F5)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
              </button>
              <button class="debug-btn" onClick={stepOver} title="Step Over (F10)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8h8M7 5l3 3-3 3M12 3v10"/></svg>
              </button>
              <button class="debug-btn" onClick={stepInto} title="Step Into (F11)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2v8M5 7l3 3 3-3M3 13h10"/></svg>
              </button>
              <button class="debug-btn" onClick={stepOut} title="Step Out (Shift+F11)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12V4M5 7l3-3 3 3M3 14h10"/></svg>
              </button>
              <button class="debug-btn stop" onClick={stopDebugSession} title="Stop (Shift+F5)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
              </button>
            </Show>
          </div>
          <Show when={launchConfigs().length > 0}>
            <select
              class="debug-config-select"
              value={selectedConfig() ?? ""}
              onChange={(e) => setSelectedConfig(e.currentTarget.value || null)}
            >
              <For each={launchConfigs()}>
                {(config) => (
                  <option value={config.name}>{config.name}</option>
                )}
              </For>
            </select>
          </Show>
          <span class="debug-status-label">
            {status() === "idle" ? "Not Started" :
             status() === "running" ? "Running" :
             status() === "paused" ? "Paused" : "Stopped"}
          </span>
        </div>
      </div>

      {/* Section Tabs */}
      <div class="debug-section-tabs">
        <button
          class={`debug-section-tab ${activeSection() === "variables" ? "active" : ""}`}
          onClick={() => setActiveSection("variables")}
        >
          Variables
        </button>
        <button
          class={`debug-section-tab ${activeSection() === "callstack" ? "active" : ""}`}
          onClick={() => setActiveSection("callstack")}
        >
          Call Stack
          <Show when={callStack().length > 0}>
            <span class="debug-badge">{callStack().length}</span>
          </Show>
        </button>
        <button
          class={`debug-section-tab ${activeSection() === "watch" ? "active" : ""}`}
          onClick={() => setActiveSection("watch")}
        >
          Watch
          <Show when={watchEntries().length > 0}>
            <span class="debug-badge">{watchEntries().length}</span>
          </Show>
        </button>
        <button
          class={`debug-section-tab ${activeSection() === "console" ? "active" : ""}`}
          onClick={() => setActiveSection("console")}
        >
          Console
          <Show when={consoleEntries().length > 0}>
            <span class="debug-badge">{consoleEntries().length}</span>
          </Show>
        </button>
        <button
          class={`debug-section-tab ${activeSection() === "breakpoints" ? "active" : ""}`}
          onClick={() => setActiveSection("breakpoints")}
        >
          Breakpoints
          <Show when={breakpoints().length > 0}>
            <span class="debug-badge">{breakpoints().length}</span>
          </Show>
        </button>
      </div>

      {/* Content */}
      <div class="debug-content">
        {/* Variables Section */}
        <Show when={activeSection() === "variables"}>
          <Show when={variables().length > 0} fallback={
            <div class="debug-empty">
              {status() === "paused" ? "No variables in scope" : "Start debugging to inspect variables"}
            </div>
          }>
            <For each={variables()}>
              {(v) => (
                <>
                  {renderVariable(v)}
                  <Show when={v.children && expandedVars().has(v.name)}>
                    <For each={v.children}>
                      {(child) => renderVariable(child, 1)}
                    </For>
                  </Show>
                </>
              )}
            </For>
          </Show>
        </Show>

        {/* Call Stack Section */}
        <Show when={activeSection() === "callstack"}>
          <Show when={callStack().length > 0} fallback={
            <div class="debug-empty">
              {status() === "paused" ? "No call stack frames" : "Start debugging to see call stack"}
            </div>
          }>
            <div class="debug-stack-filter-row">
              <input
                class="debug-stack-filter-input"
                type="text"
                placeholder="Filter frames..."
                value={stackFilter()}
                onInput={(e) => setStackFilter(e.currentTarget.value)}
              />
              <button
                class={`debug-stack-filter-btn ${showExternalFrames() ? "" : "active"}`}
                onClick={() => setShowExternalFrames(v => !v)}
                title={showExternalFrames() ? "Hide Library/External Frames" : "Show All Frames"}
              >
                {showExternalFrames() ? "My Code" : "All"}
              </button>
            </div>
            <Show when={filteredCallStack().length > 0} fallback={
              <div class="debug-empty">No frames match the filter</div>
            }>
              <For each={filteredCallStack()}>
                {(frame) => (
                  <div
                    class={`debug-stack-frame ${currentFrame()?.id === frame.id ? "current" : ""} ${isExternalFrame(frame) ? "external" : ""}`}
                    onClick={() => navigateToFrame(frame)}
                  >
                    <span class="debug-frame-name">{frame.name}</span>
                    <span class="debug-frame-location">
                      {frame.file.split("/").pop()}:{frame.line}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </Show>

        {/* Watch Expressions Section */}
        <Show when={activeSection() === "watch"}>
          <div class="debug-watch-input-row">
            <input
              class="debug-watch-input"
              type="text"
              placeholder="Add expression to watch..."
              value={watchInput()}
              onInput={(e) => setWatchInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addWatch(watchInput());
                }
              }}
            />
            <button
              class="debug-watch-add"
              onClick={() => addWatch(watchInput())}
              title="Add Watch Expression"
            >
              +
            </button>
          </div>
          <Show when={watchEntries().length > 0}>
            <For each={watchEntries()}>
              {(entry) => (
                <div class="debug-watch-row">
                  <Show when={editingWatch() === entry.id} fallback={
                    <span
                      class="debug-watch-expr"
                      onDblClick={() => setEditingWatch(entry.id)}
                      title="Double-click to edit"
                    >
                      {entry.expression}
                    </span>
                  }>
                    <input
                      class="debug-watch-edit"
                      type="text"
                      value={entry.expression}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") editWatch(entry.id, e.currentTarget.value);
                        if (e.key === "Escape") setEditingWatch(null);
                      }}
                      onBlur={(e) => editWatch(entry.id, e.currentTarget.value)}
                      autofocus
                    />
                  </Show>
                  <span class="debug-watch-sep">=</span>
                  <span class={`debug-watch-value ${entry.error ? "error" : (entry.type ?? "")}`}>
                    {entry.result}
                  </span>
                  <button
                    class="debug-watch-remove"
                    onClick={() => removeWatch(entry.id)}
                    title="Remove Watch"
                  >
                    &times;
                  </button>
                </div>
              )}
            </For>
          </Show>
          <Show when={watchEntries().length === 0}>
            <div class="debug-empty">
              Type an expression above to watch its value during debugging
            </div>
          </Show>
        </Show>

        {/* Debug Console REPL Section */}
        <Show when={activeSection() === "console"}>
          <div class="debug-console-container">
            <div class="debug-console-output">
              <Show when={consoleEntries().length === 0}>
                <div class="debug-console-welcome">
                  Debug Console. Type expressions to evaluate, or .help for commands.
                </div>
              </Show>
              <For each={consoleEntries()}>
                {(entry) => (
                  <div class={`debug-console-entry ${entry.type}`}>
                    <Show when={entry.type === "input"}>
                      <span class="debug-console-prompt">&gt;</span>
                    </Show>
                    <Show when={entry.type === "output"}>
                      <span class="debug-console-prompt">&lt;</span>
                    </Show>
                    <Show when={entry.type === "error"}>
                      <span class="debug-console-prompt">!</span>
                    </Show>
                    <Show when={entry.type === "info"}>
                      <span class="debug-console-prompt">i</span>
                    </Show>
                    <span class="debug-console-text">{entry.text}</span>
                  </div>
                )}
              </For>
              <div ref={consoleEndRef} />
            </div>
            <div class="debug-console-input-row">
              <span class="debug-console-input-prompt">&gt;</span>
              <input
                class="debug-console-input"
                type="text"
                placeholder={status() === "paused" ? "Evaluate expression..." : "Start debugging to use console"}
                value={consoleInput()}
                onInput={(e) => setConsoleInput(e.currentTarget.value)}
                onKeyDown={handleConsoleKeyDown}
              />
            </div>
          </div>
        </Show>

        {/* Breakpoints Section */}
        <Show when={activeSection() === "breakpoints"}>
          <Show when={breakpoints().length > 0} fallback={
            <div class="debug-empty">Click on the gutter (left of line numbers) to set breakpoints</div>
          }>
            <div class="debug-bp-actions">
              <button class="debug-bp-clear" onClick={clearAllBreakpoints} title="Remove All Breakpoints">
                Clear All
              </button>
            </div>
            <For each={breakpoints()}>
              {(bp) => (
                <div class="debug-bp-group">
                  <div class="debug-bp-row">
                    <input
                      type="checkbox"
                      class="debug-bp-checkbox"
                      checked={bp.enabled}
                      onChange={() => toggleBreakpointEnabled(bp.id)}
                    />
                    <span
                      class={`debug-bp-icon ${bp.logMessage ? "logpoint" : bp.condition || bp.hitCondition ? "conditional" : ""}`}
                      title={bp.logMessage ? "Logpoint" : bp.condition || bp.hitCondition ? "Conditional Breakpoint" : "Breakpoint"}
                    >
                      {bp.logMessage ? "\u25C7" : bp.condition || bp.hitCondition ? "\u25C6" : "\u25CF"}
                    </span>
                    <span
                      class="debug-bp-location"
                      onClick={() => props.onOpenFile?.(bp.file, bp.line)}
                    >
                      {bp.file.split("/").pop()}:{bp.line}
                    </span>
                    <button
                      class="debug-bp-edit-condition"
                      onClick={() => startEditCondition(bp)}
                      title="Edit Condition..."
                    >
                      {bp.condition || bp.hitCondition || bp.logMessage ? "\u270E" : "+if"}
                    </button>
                    <button
                      class="debug-bp-remove"
                      onClick={() => removeBreakpoint(bp.id)}
                      title="Remove Breakpoint"
                    >
                      &times;
                    </button>
                  </div>
                  {/* Show existing condition label */}
                  <Show when={getConditionLabel(bp) && editingBpId() !== bp.id}>
                    <div
                      class="debug-bp-condition-label"
                      onClick={() => startEditCondition(bp)}
                      title="Click to edit condition"
                    >
                      {getConditionLabel(bp)}
                    </div>
                  </Show>
                  {/* Inline condition editor */}
                  <Show when={editingBpId() === bp.id}>
                    <div class="debug-bp-condition-editor">
                      <select
                        class="debug-bp-condition-type"
                        value={conditionType()}
                        onChange={(e) => {
                          const t = e.currentTarget.value as ConditionType;
                          setConditionType(t);
                          // Load existing value for the selected type
                          setConditionInput(
                            t === "expression" ? (bp.condition ?? "") :
                            t === "hitCount" ? (bp.hitCondition ?? "") :
                            (bp.logMessage ?? "")
                          );
                        }}
                      >
                        <option value="expression">Expression</option>
                        <option value="hitCount">Hit Count</option>
                        <option value="logMessage">Log Message</option>
                      </select>
                      <input
                        class="debug-bp-condition-input"
                        type="text"
                        placeholder={
                          conditionType() === "expression" ? "e.g. x > 5" :
                          conditionType() === "hitCount" ? "e.g. 10" :
                          "e.g. value is {x}"
                        }
                        value={conditionInput()}
                        onInput={(e) => setConditionInput(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveCondition(bp.id);
                          if (e.key === "Escape") cancelEditCondition();
                        }}
                        onBlur={() => saveCondition(bp.id)}
                        autofocus
                      />
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>

      <style>{`
        .debug-panel {
          flex-direction: column;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          overflow: hidden;
        }
        .debug-toolbar {
          height: 32px;
          display: flex;
          align-items: center;
          padding: 0 var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .debug-toolbar-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .debug-controls {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .debug-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .debug-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .debug-btn.start, .debug-btn.continue {
          color: var(--accent-green);
        }
        .debug-btn.start:hover, .debug-btn.continue:hover {
          color: var(--accent-green);
          filter: brightness(1.2);
        }
        .debug-btn.stop, .debug-btn.pause {
          color: var(--accent-red);
        }
        .debug-btn.stop:hover, .debug-btn.pause:hover {
          color: var(--accent-red);
          filter: brightness(1.2);
        }
        .debug-config-select {
          height: 22px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
          max-width: 200px;
          cursor: pointer;
        }
        .debug-config-select:hover {
          border-color: var(--border-default);
        }
        .debug-config-select:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .debug-status-label {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }
        .debug-section-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .debug-section-tab {
          height: 28px;
          padding: 0 var(--space-3);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: var(--space-1);
          transition: all var(--duration-fast) var(--ease-out);
        }
        .debug-section-tab:hover {
          color: var(--text-secondary);
        }
        .debug-section-tab.active {
          color: var(--text-primary);
          border-bottom-color: var(--accent-blue);
        }
        .debug-badge {
          font-size: 10px;
          min-width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-hover);
          border-radius: 8px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
        }
        .debug-content {
          flex: 1;
          overflow-y: auto;
          font-size: var(--text-xs);
        }
        .debug-empty {
          padding: var(--space-4);
          color: var(--text-disabled);
          text-align: center;
          font-style: italic;
        }
        .debug-var-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 22px;
          padding-right: var(--space-3);
          cursor: default;
        }
        .debug-var-row:hover {
          background: var(--bg-hover);
        }
        .debug-var-expand {
          width: 12px;
          cursor: pointer;
          color: var(--text-tertiary);
          font-size: 10px;
          user-select: none;
        }
        .debug-var-name {
          color: var(--accent-blue);
          font-family: var(--font-mono);
        }
        .debug-var-sep {
          color: var(--text-disabled);
        }
        .debug-var-value {
          color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .debug-var-value.string {
          color: var(--accent-green);
        }
        .debug-var-value.number {
          color: var(--accent-orange);
        }
        .debug-var-value.object {
          color: var(--text-secondary);
        }
        .debug-var-type {
          color: var(--text-disabled);
          font-size: 10px;
          margin-left: var(--space-1);
        }
        .debug-stack-frame {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 24px;
          padding: 0 var(--space-3);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .debug-stack-frame:hover {
          background: var(--bg-hover);
        }
        .debug-stack-frame.current {
          background: rgba(255, 159, 10, 0.08);
          border-left: 3px solid var(--accent-orange);
        }
        .debug-frame-name {
          color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .debug-frame-location {
          color: var(--text-tertiary);
          font-family: var(--font-mono);
        }
        .debug-stack-frame.external .debug-frame-name {
          color: var(--text-disabled);
          font-style: italic;
        }
        .debug-stack-frame.external .debug-frame-location {
          color: var(--text-disabled);
        }
        .debug-stack-filter-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 4px var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
        }
        .debug-stack-filter-input {
          flex: 1;
          height: 22px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
        }
        .debug-stack-filter-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .debug-stack-filter-input::placeholder {
          color: var(--text-disabled);
        }
        .debug-stack-filter-btn {
          height: 22px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 10px;
          font-family: var(--font-mono);
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .debug-stack-filter-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .debug-stack-filter-btn.active {
          background: var(--accent-blue);
          color: white;
          border-color: var(--accent-blue);
        }
        .debug-bp-actions {
          padding: 4px var(--space-3);
          display: flex;
          justify-content: flex-end;
        }
        .debug-bp-clear {
          height: 20px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 10px;
          cursor: pointer;
        }
        .debug-bp-clear:hover {
          color: var(--text-primary);
          border-color: var(--text-tertiary);
        }
        .debug-bp-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 24px;
          padding: 0 var(--space-3);
        }
        .debug-bp-row:hover {
          background: var(--bg-hover);
        }
        .debug-bp-checkbox {
          accent-color: var(--accent-red);
        }
        .debug-bp-location {
          flex: 1;
          font-family: var(--font-mono);
          color: var(--text-secondary);
          cursor: pointer;
        }
        .debug-bp-location:hover {
          color: var(--accent-blue);
          text-decoration: underline;
        }
        .debug-bp-remove {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-disabled);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 14px;
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .debug-bp-row:hover .debug-bp-remove {
          opacity: 1;
        }
        .debug-bp-remove:hover {
          color: var(--accent-red);
          background: var(--bg-hover);
        }
        .debug-bp-group {
          border-bottom: 1px solid var(--border-subtle);
        }
        .debug-bp-group:last-child {
          border-bottom: none;
        }
        .debug-bp-icon {
          font-size: 10px;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
          color: var(--accent-red);
        }
        .debug-bp-icon.conditional {
          color: var(--accent-orange);
        }
        .debug-bp-icon.logpoint {
          color: var(--accent-blue);
        }
        .debug-bp-edit-condition {
          height: 18px;
          padding: 0 4px;
          background: transparent;
          border: none;
          color: var(--text-disabled);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 10px;
          font-family: var(--font-mono);
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .debug-bp-row:hover .debug-bp-edit-condition {
          opacity: 1;
        }
        .debug-bp-edit-condition:hover {
          color: var(--accent-orange);
          background: var(--bg-hover);
        }
        .debug-bp-condition-label {
          padding: 0 var(--space-3) 2px 36px;
          font-size: 10px;
          font-family: var(--font-mono);
          color: var(--accent-orange);
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .debug-bp-condition-label:hover {
          text-decoration: underline;
        }
        .debug-bp-condition-editor {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 2px var(--space-3) 4px 36px;
        }
        .debug-bp-condition-type {
          height: 20px;
          padding: 0 var(--space-1);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 10px;
          font-family: var(--font-mono);
          cursor: pointer;
          flex-shrink: 0;
        }
        .debug-bp-condition-type:focus {
          outline: none;
          border-color: var(--accent-orange);
        }
        .debug-bp-condition-input {
          flex: 1;
          height: 20px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--accent-orange);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
        }
        .debug-bp-condition-input:focus {
          outline: none;
        }
        .debug-bp-condition-input::placeholder {
          color: var(--text-disabled);
        }
        .debug-watch-input-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 4px var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
        }
        .debug-watch-input {
          flex: 1;
          height: 22px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
        }
        .debug-watch-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .debug-watch-input::placeholder {
          color: var(--text-disabled);
        }
        .debug-watch-add {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
        }
        .debug-watch-add:hover {
          background: var(--bg-hover);
          border-color: var(--accent-blue);
          color: var(--accent-blue);
        }
        .debug-watch-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 24px;
          padding: 0 var(--space-3);
        }
        .debug-watch-row:hover {
          background: var(--bg-hover);
        }
        .debug-watch-expr {
          color: var(--accent-blue);
          font-family: var(--font-mono);
          font-size: 11px;
          cursor: default;
          min-width: 40px;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .debug-watch-edit {
          height: 20px;
          padding: 0 var(--space-1);
          background: var(--bg-input);
          border: 1px solid var(--accent-blue);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          font-family: var(--font-mono);
          min-width: 40px;
          max-width: 140px;
        }
        .debug-watch-edit:focus {
          outline: none;
        }
        .debug-watch-sep {
          color: var(--text-disabled);
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .debug-watch-value {
          flex: 1;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 11px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .debug-watch-value.string {
          color: var(--accent-green);
        }
        .debug-watch-value.number {
          color: var(--accent-orange);
        }
        .debug-watch-value.error {
          color: var(--accent-red);
          font-style: italic;
        }
        .debug-watch-remove {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-disabled);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 14px;
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .debug-watch-row:hover .debug-watch-remove {
          opacity: 1;
        }
        .debug-watch-remove:hover {
          color: var(--accent-red);
          background: var(--bg-hover);
        }
        .debug-console-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .debug-console-output {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-1) 0;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
        }
        .debug-console-welcome {
          padding: var(--space-3);
          color: var(--text-disabled);
          font-style: italic;
          font-size: 11px;
        }
        .debug-console-entry {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
          padding: 1px var(--space-3);
          min-height: 20px;
        }
        .debug-console-entry:hover {
          background: var(--bg-hover);
        }
        .debug-console-entry.input {
          color: var(--text-primary);
        }
        .debug-console-entry.output {
          color: var(--accent-blue);
        }
        .debug-console-entry.error {
          color: var(--accent-red);
        }
        .debug-console-entry.info {
          color: var(--text-tertiary);
        }
        .debug-console-prompt {
          width: 12px;
          flex-shrink: 0;
          font-weight: bold;
          user-select: none;
        }
        .debug-console-entry.input .debug-console-prompt {
          color: var(--accent-green);
        }
        .debug-console-entry.output .debug-console-prompt {
          color: var(--accent-blue);
        }
        .debug-console-entry.error .debug-console-prompt {
          color: var(--accent-red);
        }
        .debug-console-entry.info .debug-console-prompt {
          color: var(--text-disabled);
        }
        .debug-console-text {
          flex: 1;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .debug-console-input-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 4px var(--space-3);
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          flex-shrink: 0;
        }
        .debug-console-input-prompt {
          color: var(--accent-green);
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: bold;
          user-select: none;
        }
        .debug-console-input {
          flex: 1;
          height: 24px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 12px;
          font-family: var(--font-mono);
        }
        .debug-console-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .debug-console-input::placeholder {
          color: var(--text-disabled);
        }
      `}</style>
    </div>
  );
}
