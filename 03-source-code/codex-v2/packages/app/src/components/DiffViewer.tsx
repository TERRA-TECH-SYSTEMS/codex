// ============================================================================
// CodeEX v2 — Inline Diff Viewer
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Side-by-side or unified diff display for file changes.
// Used by ageixt mode to show proposed edits before applying.
// ============================================================================

import { createSignal, createMemo, For, Show } from "solid-js";

export interface DiffLine {
  type: "add" | "remove" | "context";
  oldNum?: number;
  newNum?: number;
  content: string;
}

interface Props {
  fileName: string;
  oldContent: string;
  newContent: string;
  onAccept?: () => void;
  onReject?: () => void;
  onClose: () => void;
}

/** Simple line-based diff algorithm (Myers-like, optimized for readability). */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  let i = m;
  let j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "context", oldNum: i, newNum: j, content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", newNum: j, content: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "remove", oldNum: i, content: oldLines[i - 1] });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

export function DiffViewer(props: Props) {
  const [mode, setMode] = createSignal<"unified" | "split">("unified");

  const diffLines = createMemo(() => computeDiff(props.oldContent, props.newContent));

  const stats = createMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines()) {
      if (line.type === "add") added++;
      if (line.type === "remove") removed++;
    }
    return { added, removed };
  });

  return (
    <div class="diff-overlay" onClick={props.onClose}>
      <div class="diff-panel" onClick={(e) => e.stopPropagation()}>
        <div class="diff-header">
          <div class="diff-header-left">
            <span class="diff-filename">{props.fileName}</span>
            <span class="diff-stats">
              <span class="diff-stat-add">+{stats().added}</span>
              <span class="diff-stat-remove">-{stats().removed}</span>
            </span>
          </div>
          <div class="diff-header-right">
            <button
              class={`diff-mode-btn ${mode() === "unified" ? "active" : ""}`}
              onClick={() => setMode("unified")}
            >
              Unified
            </button>
            <button
              class={`diff-mode-btn ${mode() === "split" ? "active" : ""}`}
              onClick={() => setMode("split")}
            >
              Split
            </button>
            <Show when={props.onAccept}>
              <button class="diff-action-btn accept" onClick={props.onAccept}>
                Accept
              </button>
            </Show>
            <Show when={props.onReject}>
              <button class="diff-action-btn reject" onClick={props.onReject}>
                Reject
              </button>
            </Show>
            <button class="diff-close" onClick={props.onClose}>&times;</button>
          </div>
        </div>

        <div class="diff-body">
          <Show when={mode() === "unified"}>
            <div class="diff-unified">
              <For each={diffLines()}>
                {(line) => (
                  <div class={`diff-line ${line.type}`}>
                    <span class="diff-gutter old">{line.oldNum ?? ""}</span>
                    <span class="diff-gutter new">{line.newNum ?? ""}</span>
                    <span class="diff-sign">
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                    </span>
                    <span class="diff-content">{line.content}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={mode() === "split"}>
            <div class="diff-split">
              <div class="diff-split-pane">
                <div class="diff-split-header">Original</div>
                <For each={diffLines()}>
                  {(line) => (
                    <Show when={line.type !== "add"}>
                      <div class={`diff-line ${line.type === "remove" ? "remove" : "context"}`}>
                        <span class="diff-gutter old">{line.oldNum ?? ""}</span>
                        <span class="diff-sign">
                          {line.type === "remove" ? "-" : " "}
                        </span>
                        <span class="diff-content">{line.content}</span>
                      </div>
                    </Show>
                  )}
                </For>
              </div>
              <div class="diff-split-divider" />
              <div class="diff-split-pane">
                <div class="diff-split-header">Modified</div>
                <For each={diffLines()}>
                  {(line) => (
                    <Show when={line.type !== "remove"}>
                      <div class={`diff-line ${line.type === "add" ? "add" : "context"}`}>
                        <span class="diff-gutter new">{line.newNum ?? ""}</span>
                        <span class="diff-sign">
                          {line.type === "add" ? "+" : " "}
                        </span>
                        <span class="diff-content">{line.content}</span>
                      </div>
                    </Show>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>

      <style>{`
        .diff-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
        }
        .diff-panel {
          width: 900px;
          max-width: 90vw;
          max-height: 85vh;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .diff-header {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .diff-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .diff-filename {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .diff-stats {
          display: flex;
          gap: var(--space-2);
          font-size: var(--text-xs);
          font-family: var(--font-mono);
        }
        .diff-stat-add {
          color: var(--accent-green);
        }
        .diff-stat-remove {
          color: var(--accent-red);
        }
        .diff-header-right {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .diff-mode-btn {
          height: 26px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .diff-mode-btn.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }
        .diff-action-btn {
          height: 26px;
          padding: 0 var(--space-3);
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .diff-action-btn.accept {
          background: var(--accent-green);
          color: white;
        }
        .diff-action-btn.accept:hover {
          filter: brightness(1.1);
        }
        .diff-action-btn.reject {
          background: var(--accent-red);
          color: white;
        }
        .diff-action-btn.reject:hover {
          filter: brightness(1.1);
        }
        .diff-close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 18px;
          cursor: pointer;
          margin-left: var(--space-2);
        }
        .diff-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .diff-body {
          flex: 1;
          overflow-y: auto;
        }
        .diff-unified, .diff-split-pane {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          line-height: 1.6;
        }
        .diff-split {
          display: flex;
          height: 100%;
        }
        .diff-split-pane {
          flex: 1;
          overflow-y: auto;
        }
        .diff-split-divider {
          width: 1px;
          background: var(--border-subtle);
          flex-shrink: 0;
        }
        .diff-split-header {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .diff-line {
          display: flex;
          min-height: 22px;
          align-items: stretch;
        }
        .diff-line.add {
          background: rgba(48, 209, 88, 0.08);
        }
        .diff-line.remove {
          background: rgba(255, 69, 58, 0.08);
        }
        .diff-gutter {
          width: 44px;
          text-align: right;
          padding-right: var(--space-2);
          color: var(--text-disabled);
          user-select: none;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .diff-sign {
          width: 16px;
          text-align: center;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
        }
        .diff-line.add .diff-sign {
          color: var(--accent-green);
          font-weight: 700;
        }
        .diff-line.remove .diff-sign {
          color: var(--accent-red);
          font-weight: 700;
        }
        .diff-content {
          flex: 1;
          white-space: pre;
          padding-right: var(--space-2);
          color: var(--text-primary);
          display: flex;
          align-items: center;
        }
        .diff-line.add .diff-content {
          color: var(--accent-green);
        }
        .diff-line.remove .diff-content {
          color: var(--accent-red);
        }
      `}</style>
    </div>
  );
}
