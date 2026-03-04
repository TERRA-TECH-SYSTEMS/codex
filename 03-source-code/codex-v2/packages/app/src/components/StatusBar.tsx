// ============================================================================
// CodeEX v2 — Status Bar
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { getTerraForgeStatus } from "~/lib/terraforge-client";
import { notify } from "~/lib/notifications";
import { theme, toggleTheme } from "~/lib/theme";
import type { LspStatus } from "~/lib/lsp-client";
import type { DebugSessionStatus } from "~/lib/types";

interface Props {
  activeFile: string | null;
  sidebarVisible: boolean;
  chatVisible: boolean;
}

export function StatusBar(props: Props) {
  const [terraforgeStatus, setTerraforgeStatus] = createSignal<"connected" | "disconnected" | "checking">("checking");
  const [cursorPos, setCursorPos] = createSignal({ line: 1, col: 1, selected: 0 });
  const [lspStatus, setLspStatus] = createSignal<LspStatus>("stopped");
  const [debugStatus, setDebugStatus] = createSignal<DebugSessionStatus>("idle");
  const [gitBranch, setGitBranch] = createSignal("");
  const [gixsisVersion, setGixsisVersion] = createSignal("");

  // Listen for git branch updates from Sidebar
  const handleGitBranch = ((e: CustomEvent<{ branch: string }>) => {
    setGitBranch(e.detail.branch);
  }) as EventListener;
  document.addEventListener("codex:git-branch", handleGitBranch);
  onCleanup(() => document.removeEventListener("codex:git-branch", handleGitBranch));

  let wasConnected = false;
  const checkConnection = async () => {
    setTerraforgeStatus("checking");
    const status = await getTerraForgeStatus();
    const nowConnected = status.available;
    setTerraforgeStatus(nowConnected ? "connected" : "disconnected");

    // Derive Gixsis version from TerraForge model list
    if (nowConnected && status.models.length > 0) {
      const gixsis = status.models.find((m) => m.name.toLowerCase().startsWith("gixsis"));
      if (gixsis) {
        setGixsisVersion(gixsis.name);
      }
    }

    // Notify on state transitions
    if (wasConnected && !nowConnected) {
      notify("TerraForge Engine disconnected", "error", 6000);
    } else if (!wasConnected && nowConnected && wasConnected !== undefined) {
      notify("TerraForge Engine connected", "success", 3000);
    }
    wasConnected = nowConnected;
  };

  // Check connection on mount and every 30 seconds
  createEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30_000);
    onCleanup(() => clearInterval(interval));
  });

  // Listen for cursor position updates from EditorArea
  const handleCursorUpdate = ((e: CustomEvent<{ line: number; col: number; selected: number }>) => {
    setCursorPos(e.detail);
  }) as EventListener;
  document.addEventListener("codex:cursor-update", handleCursorUpdate);
  onCleanup(() => document.removeEventListener("codex:cursor-update", handleCursorUpdate));

  // Listen for LSP status changes
  const handleLspStatus = ((e: CustomEvent<{ status: LspStatus }>) => {
    setLspStatus(e.detail.status);
  }) as EventListener;
  document.addEventListener("codex:lsp-status", handleLspStatus);
  onCleanup(() => document.removeEventListener("codex:lsp-status", handleLspStatus));

  // Listen for debug state changes
  const handleDebugState = ((e: CustomEvent) => {
    setDebugStatus(e.detail?.status ?? "idle");
  }) as EventListener;
  document.addEventListener("codex:debug-state-changed", handleDebugState);
  onCleanup(() => document.removeEventListener("codex:debug-state-changed", handleDebugState));

  const statusColor = () => {
    switch (terraforgeStatus()) {
      case "connected": return "var(--accent-green)";
      case "disconnected": return "var(--accent-red)";
      case "checking": return "var(--accent-orange)";
    }
  };

  const ext = () => props.activeFile?.split(".").pop() ?? "";
  const langLabel = () => {
    const e = ext();
    if (e === "ts" || e === "tsx") return "TypeScript";
    if (e === "js" || e === "jsx") return "JavaScript";
    if (e === "rs") return "Rust";
    if (e === "py") return "Python";
    if (e === "json") return "JSON";
    if (e === "md") return "Markdown";
    if (e === "css") return "CSS";
    if (e === "html") return "HTML";
    return e.toUpperCase() || "Plain Text";
  };

  return (
    <div class="status-bar">
      <div class="status-left">
        <div class="status-item status-branch" title={`Branch: ${gitBranch() || "\u2014"}`}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 113 2.122V6.5a2 2 0 01-2 2H8.5v2.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A3.5 3.5 0 0010.5 6.5V5.372A2.25 2.25 0 019.5 3.25zM7.75 3.25a.75.75 0 10-1.5 0 .75.75 0 001.5 0zm0 9.5a.75.75 0 10-1.5 0 .75.75 0 001.5 0zM11 4a.75.75 0 10-1.5 0A.75.75 0 0011 4z"/></svg>
          <span>{gitBranch() || "\u2014"}</span>
        </div>
        <div class="status-item" title={`TerraForge: ${terraforgeStatus()}`}>
          <span class="status-dot" style={{ background: statusColor() }} />
          <span>TerraForge</span>
        </div>
        <div class="status-item" title="Gixsis AI model served by TerraForge Engine">
          <span>{gixsisVersion() || "Gixsis"}</span>
        </div>
        <Show when={lspStatus() !== "stopped"}>
          <div class="status-item" title={`Language Server: ${lspStatus()}`}>
            <span class="status-dot" style={{
              background: lspStatus() === "ready" ? "var(--accent-green)"
                : lspStatus() === "starting" ? "var(--accent-orange)"
                : "var(--accent-red)",
            }} />
            <span title="Language Server">{lspStatus() === "ready" ? "LSP" : lspStatus() === "starting" ? "LSP..." : "LSP ✕"}</span>
          </div>
        </Show>
        <Show when={debugStatus() !== "idle"}>
          <div class="status-item" title={`Debug: ${debugStatus()}`}>
            <span class="status-dot" style={{
              background: debugStatus() === "running" ? "var(--accent-green)"
                : debugStatus() === "paused" ? "var(--accent-orange)"
                : "var(--accent-red)",
            }} />
            <span>{debugStatus() === "running" ? "Debug" : debugStatus() === "paused" ? "Paused" : "Debug ✕"}</span>
          </div>
        </Show>
      </div>
      <div class="status-right">
        <div class="status-item cursor-pos">
          Ln {cursorPos().line}, Col {cursorPos().col}
          {cursorPos().selected > 0 && ` (${cursorPos().selected} selected)`}
        </div>
        <div class="status-item">Spaces: 2</div>
        <div class="status-item">{langLabel()}</div>
        <div class="status-item">UTF-8</div>
        <div class="status-item">LF</div>
        <button
          class="status-item status-theme-btn"
          onClick={toggleTheme}
          title={theme() === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Show when={theme() === "dark"} fallback={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          }>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </Show>
        </button>
        <div class="status-item brand">CodeEX v2</div>
      </div>

      <style>{`
        .status-bar {
          height: var(--statusbar-height);
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-3);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          user-select: none;
        }
        .status-left, .status-right {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }
        .status-item {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .status-item.cursor-pos {
          font-family: var(--font-mono);
          letter-spacing: 0;
        }
        .status-item.brand {
          color: var(--accent-blue);
          font-weight: 600;
        }
        .status-branch {
          font-family: var(--font-mono);
          font-weight: 600;
        }
        .status-branch svg {
          flex-shrink: 0;
        }
        .status-theme-btn {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 2px 4px;
          border-radius: var(--radius-sm);
          transition: color var(--duration-fast) var(--ease-out);
        }
        .status-theme-btn:hover {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
