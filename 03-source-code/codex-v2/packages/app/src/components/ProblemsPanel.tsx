// ============================================================================
// CodeEX v2 — Problems Panel (Errors & Warnings)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Displays diagnostics (errors, warnings, info) from type checking and linting.
// In desktop mode, runs `npx tsc --noEmit` or parses build output.
// ============================================================================

import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import type { Diagnostic } from "~/lib/types";

interface Props {
  visible: boolean;
  height?: number;
  onOpenFile?: (path: string, line?: number) => void;
}

/** Parse TypeScript compiler output into diagnostics.
 *  Format: src/file.ts(10,5): error TS2304: Cannot find name 'foo'.
 */
function parseTscOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = output.split("\n");
  const tscPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
  for (const line of lines) {
    const match = tscPattern.exec(line.trim());
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2], 10),
        col: parseInt(match[3], 10),
        severity: match[4] as "error" | "warning",
        message: `${match[5]}: ${match[6]}`,
        source: "tsc",
      });
    }
  }
  return diagnostics;
}

/** Parse generic compiler/linter output (file:line:col: severity message) */
function parseGenericOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = output.split("\n");
  const genericPattern = /^(.+?):(\d+):(\d+):\s*(error|warning|info)\s+(.+)$/;
  for (const line of lines) {
    const match = genericPattern.exec(line.trim());
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2], 10),
        col: parseInt(match[3], 10),
        severity: match[4] as "error" | "warning" | "info",
        message: match[5],
        source: "lint",
      });
    }
  }
  return diagnostics;
}

export function ProblemsPanel(props: Props) {
  const [diagnostics, setDiagnostics] = createSignal<Diagnostic[]>([]);
  const [checking, setChecking] = createSignal(false);
  const [lastCheck, setLastCheck] = createSignal("");

  const hasTerraRuntime = () => !!(window as any).__TAURI__?.core?.invoke;

  async function runCheck(command: string): Promise<string> {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) throw new Error("TerraRuntime not available");
    return (await tr.core.invoke("run_command", { command })) as string;
  }

  async function runDiagnostics() {
    if (!hasTerraRuntime() || checking()) return;
    setChecking(true);
    setDiagnostics([]);
    try {
      // Try TypeScript first
      const output = await runCheck("npx tsc --noEmit 2>&1");
      let parsed = parseTscOutput(output);
      if (parsed.length === 0) {
        parsed = parseGenericOutput(output);
      }
      setDiagnostics(parsed);
      setLastCheck(parsed.length === 0 ? "No problems found" : `${parsed.length} problem${parsed.length !== 1 ? "s" : ""}`);
    } catch (err: any) {
      setLastCheck(`Check failed: ${err.message || err}`);
    } finally {
      setChecking(false);
    }
  }

  // Per-file diagnostic store for LSP (diagnostics arrive per-file)
  const fileDiagnostics = new Map<string, Diagnostic[]>();

  // Listen for external diagnostics (from agent, build system, or LSP)
  const handleDiagnostics = ((e: CustomEvent<{ file?: string; diagnostics: Diagnostic[] }>) => {
    if (e.detail.file) {
      // Per-file update (LSP): merge into file map
      const normalized = e.detail.file.replace(/\\/g, "/");
      if (e.detail.diagnostics.length === 0) {
        fileDiagnostics.delete(normalized);
      } else {
        fileDiagnostics.set(normalized, e.detail.diagnostics);
      }
      // Flatten all file diagnostics into the signal
      const all: Diagnostic[] = [];
      fileDiagnostics.forEach((diags) => all.push(...diags));
      setDiagnostics(all);
    } else {
      // Bulk replace (build system / tsc)
      fileDiagnostics.clear();
      setDiagnostics(e.detail.diagnostics);
    }
    const count = diagnostics().length;
    setLastCheck(count === 0 ? "No problems found" : `${count} problem${count !== 1 ? "s" : ""}`);
  }) as EventListener;
  onMount(() => document.addEventListener("codex:set-diagnostics", handleDiagnostics));
  onCleanup(() => document.removeEventListener("codex:set-diagnostics", handleDiagnostics));

  const errorCount = () => diagnostics().filter((d) => d.severity === "error").length;
  const warningCount = () => diagnostics().filter((d) => d.severity === "warning").length;
  const infoCount = () => diagnostics().filter((d) => d.severity === "info").length;

  const severityIcon = (s: string) => {
    switch (s) {
      case "error": return "\u2718";
      case "warning": return "\u26A0";
      case "info": return "\u2139";
      default: return "\u2022";
    }
  };
  const severityColor = (s: string) => {
    switch (s) {
      case "error": return "var(--accent-red)";
      case "warning": return "var(--accent-orange)";
      case "info": return "var(--accent-blue)";
      default: return "var(--text-tertiary)";
    }
  };

  return (
    <div
      class="problems-panel"
      style={{
        display: props.visible ? "flex" : "none",
        height: props.height ? `${props.height}px` : "200px",
      }}
    >
      {/* Toolbar */}
      <div class="problems-toolbar">
        <div class="problems-counts">
          <Show when={errorCount() > 0}>
            <span class="problems-count" style={{ color: "var(--accent-red)" }}>
              {severityIcon("error")} {errorCount()}
            </span>
          </Show>
          <Show when={warningCount() > 0}>
            <span class="problems-count" style={{ color: "var(--accent-orange)" }}>
              {severityIcon("warning")} {warningCount()}
            </span>
          </Show>
          <Show when={infoCount() > 0}>
            <span class="problems-count" style={{ color: "var(--accent-blue)" }}>
              {severityIcon("info")} {infoCount()}
            </span>
          </Show>
          <Show when={diagnostics().length === 0 && lastCheck()}>
            <span class="problems-status">{lastCheck()}</span>
          </Show>
        </div>
        <Show when={hasTerraRuntime()}>
          <button class="problems-check-btn" onClick={runDiagnostics} disabled={checking()}>
            {checking() ? "Checking..." : "Run Check"}
          </button>
        </Show>
      </div>

      {/* Diagnostic list */}
      <div class="problems-list">
        <Show when={!hasTerraRuntime()}>
          <div class="problems-empty">Diagnostics require TerraRuntime (desktop mode)</div>
        </Show>
        <Show when={hasTerraRuntime() && diagnostics().length === 0 && !checking()}>
          <div class="problems-empty">
            {lastCheck() || "Click \"Run Check\" to scan for problems"}
          </div>
        </Show>
        <For each={diagnostics()}>
          {(d) => (
            <div
              class="problems-item"
              onClick={() => props.onOpenFile?.(d.file, d.line)}
            >
              <span class="problems-severity" style={{ color: severityColor(d.severity) }}>
                {severityIcon(d.severity)}
              </span>
              <span class="problems-message">{d.message}</span>
              <span class="problems-location">
                {d.file.split("/").pop()}:{d.line}:{d.col}
              </span>
              <Show when={d.source}>
                <span class="problems-source">{d.source}</span>
              </Show>
            </div>
          )}
        </For>
      </div>

      <style>{`
        .problems-panel {
          flex-direction: column;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          overflow: hidden;
        }
        .problems-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 32px;
          padding: 0 var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .problems-counts {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .problems-count {
          font-size: var(--text-xs);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .problems-status {
          font-size: var(--text-xs);
          color: var(--text-disabled);
        }
        .problems-check-btn {
          height: 22px;
          padding: 0 var(--space-2);
          background: rgba(41, 151, 255, 0.08);
          border: 1px solid rgba(41, 151, 255, 0.2);
          border-radius: var(--radius-sm);
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .problems-check-btn:hover:not(:disabled) {
          background: rgba(41, 151, 255, 0.15);
        }
        .problems-check-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .problems-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-1) 0;
        }
        .problems-empty {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-align: center;
          padding: var(--space-4);
          font-style: italic;
        }
        .problems-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 24px;
          padding: 0 var(--space-3);
          cursor: pointer;
          font-size: var(--text-xs);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .problems-item:hover {
          background: var(--bg-hover);
        }
        .problems-severity {
          width: 14px;
          text-align: center;
          flex-shrink: 0;
          font-size: 12px;
        }
        .problems-message {
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .problems-location {
          color: var(--text-disabled);
          font-family: var(--font-mono);
          font-size: 10px;
          flex-shrink: 0;
        }
        .problems-source {
          color: var(--text-disabled);
          font-size: 10px;
          background: var(--bg-card);
          padding: 0 4px;
          border-radius: 4px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
