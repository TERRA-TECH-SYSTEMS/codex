// ============================================================================
// CodeEX v2 — 3-Way Merge Editor
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Dedicated merge editor showing Current (ours), Incoming (theirs), and
// Result (merged output). Conflict blocks highlighted with resolution controls.
// ============================================================================

import { createSignal, createMemo, For, Show } from "solid-js";
import {
  parseThreeWayMerge,
  resolveConflict,
  buildMergedResult,
  getUnresolvedCount,
  type ThreeWayMergeInput,
  type ThreeWayMergeState,
  type MergeConflictBlock,
} from "~/lib/merge-conflict";

interface Props {
  filePath: string;
  currentContent: string;
  incomingContent: string;
  baseContent?: string;
  currentLabel?: string;
  incomingLabel?: string;
  onAccept?: (mergedContent: string) => void;
  onCancel: () => void;
}

export function MergeEditor(props: Props) {
  const input: ThreeWayMergeInput = {
    filePath: props.filePath,
    current: props.currentContent,
    incoming: props.incomingContent,
    base: props.baseContent,
  };

  const [mergeState, setMergeState] = createSignal<ThreeWayMergeState>(parseThreeWayMerge(input));
  const [activeConflict, setActiveConflict] = createSignal(0);
  const [showResult, setShowResult] = createSignal(false);

  const unresolvedCount = createMemo(() => getUnresolvedCount(mergeState()));
  const totalConflicts = createMemo(() => mergeState().conflicts.length);
  const mergedResult = createMemo(() => buildMergedResult(mergeState()));
  const canAccept = createMemo(() => mergedResult() !== null);

  const handleResolve = (index: number, resolution: MergeConflictBlock["resolution"]) => {
    setMergeState(resolveConflict(mergeState(), index, resolution));
    // Auto-advance to next unresolved
    if (resolution !== "unresolved") {
      const state = resolveConflict(mergeState(), index, resolution);
      const nextUnresolved = state.conflicts.findIndex((c, i) => i > index && c.resolution === "unresolved");
      if (nextUnresolved >= 0) setActiveConflict(nextUnresolved);
    }
  };

  const navigateConflict = (direction: 1 | -1) => {
    const next = activeConflict() + direction;
    if (next >= 0 && next < totalConflicts()) {
      setActiveConflict(next);
    }
  };

  const handleAccept = () => {
    const result = mergedResult();
    if (result !== null && props.onAccept) {
      props.onAccept(result);
    }
  };

  const resolutionLabel = (c: MergeConflictBlock) => {
    switch (c.resolution) {
      case "current": return "Current";
      case "incoming": return "Incoming";
      case "both": return "Both";
      case "custom": return "Custom";
      default: return "Unresolved";
    }
  };

  const resolutionColor = (c: MergeConflictBlock) => {
    switch (c.resolution) {
      case "current": return "var(--accent-green)";
      case "incoming": return "var(--accent-blue)";
      case "both": return "var(--accent-purple)";
      case "custom": return "var(--accent-orange)";
      default: return "var(--accent-red)";
    }
  };

  return (
    <div class="merge-overlay" onClick={props.onCancel}>
      <div class="merge-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="merge-header">
          <div class="merge-header-left">
            <span class="merge-filename">{props.filePath.split(/[/\\]/).pop()}</span>
            <span class="merge-conflict-count">
              {unresolvedCount() === 0
                ? <span style={{ color: "var(--accent-green)" }}>All conflicts resolved</span>
                : <span>{unresolvedCount()} of {totalConflicts()} conflicts remaining</span>
              }
            </span>
          </div>
          <div class="merge-header-right">
            <button class="merge-nav-btn" onClick={() => navigateConflict(-1)} disabled={activeConflict() === 0}>
              Prev
            </button>
            <span class="merge-nav-label">
              {totalConflicts() > 0 ? `${activeConflict() + 1}/${totalConflicts()}` : "0/0"}
            </span>
            <button class="merge-nav-btn" onClick={() => navigateConflict(1)} disabled={activeConflict() >= totalConflicts() - 1}>
              Next
            </button>
            <button
              class={`merge-view-btn ${showResult() ? "active" : ""}`}
              onClick={() => setShowResult(!showResult())}
            >
              Result
            </button>
            <Show when={props.onAccept}>
              <button
                class="merge-accept-btn"
                disabled={!canAccept()}
                onClick={handleAccept}
              >
                Accept Merge
              </button>
            </Show>
            <button class="merge-close" onClick={props.onCancel}>&times;</button>
          </div>
        </div>

        {/* Conflict overview bar */}
        <div class="merge-conflict-bar">
          <For each={mergeState().conflicts}>
            {(c, i) => (
              <div
                class={`merge-conflict-pip ${activeConflict() === i() ? "active" : ""}`}
                style={{ background: resolutionColor(c) }}
                onClick={() => setActiveConflict(i())}
                title={`Conflict ${i() + 1}: ${resolutionLabel(c)}`}
              />
            )}
          </For>
        </div>

        {/* 3-pane body */}
        <Show when={!showResult()}>
          <div class="merge-body">
            {/* Current (Ours) pane */}
            <div class="merge-pane">
              <div class="merge-pane-header current">
                {props.currentLabel ?? "Current Change"} (Ours)
              </div>
              <div class="merge-pane-content">
                <For each={mergeState().conflicts}>
                  {(c, i) => (
                    <Show when={i() === activeConflict()}>
                      <div class="merge-conflict-block">
                        <div class="merge-block-actions">
                          <button
                            class={`merge-resolve-btn ${c.resolution === "current" ? "selected" : ""}`}
                            onClick={() => handleResolve(i(), "current")}
                          >
                            Accept Current
                          </button>
                        </div>
                        <div class="merge-lines current">
                          <For each={c.currentLines}>
                            {(line, li) => (
                              <div class="merge-line">
                                <span class="merge-line-num">{li() + 1}</span>
                                <span class="merge-line-content">{line}</span>
                              </div>
                            )}
                          </For>
                          <Show when={c.currentLines.length === 0}>
                            <div class="merge-empty">(empty)</div>
                          </Show>
                        </div>
                      </div>
                    </Show>
                  )}
                </For>
              </div>
            </div>

            {/* Center controls */}
            <div class="merge-center">
              <For each={mergeState().conflicts}>
                {(c, i) => (
                  <Show when={i() === activeConflict()}>
                    <div class="merge-center-controls">
                      <div class="merge-center-label" style={{ color: resolutionColor(c) }}>
                        {resolutionLabel(c)}
                      </div>
                      <button
                        class={`merge-center-btn ${c.resolution === "both" ? "selected" : ""}`}
                        onClick={() => handleResolve(i(), "both")}
                        title="Accept both changes"
                      >
                        Both
                      </button>
                      <button
                        class="merge-center-btn reset"
                        onClick={() => handleResolve(i(), "unresolved")}
                        title="Reset to unresolved"
                      >
                        Reset
                      </button>
                    </div>
                  </Show>
                )}
              </For>
            </div>

            {/* Incoming (Theirs) pane */}
            <div class="merge-pane">
              <div class="merge-pane-header incoming">
                {props.incomingLabel ?? "Incoming Change"} (Theirs)
              </div>
              <div class="merge-pane-content">
                <For each={mergeState().conflicts}>
                  {(c, i) => (
                    <Show when={i() === activeConflict()}>
                      <div class="merge-conflict-block">
                        <div class="merge-block-actions">
                          <button
                            class={`merge-resolve-btn ${c.resolution === "incoming" ? "selected" : ""}`}
                            onClick={() => handleResolve(i(), "incoming")}
                          >
                            Accept Incoming
                          </button>
                        </div>
                        <div class="merge-lines incoming">
                          <For each={c.incomingLines}>
                            {(line, li) => (
                              <div class="merge-line">
                                <span class="merge-line-num">{li() + 1}</span>
                                <span class="merge-line-content">{line}</span>
                              </div>
                            )}
                          </For>
                          <Show when={c.incomingLines.length === 0}>
                            <div class="merge-empty">(empty)</div>
                          </Show>
                        </div>
                      </div>
                    </Show>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* Result view */}
        <Show when={showResult()}>
          <div class="merge-result">
            <div class="merge-pane-header result">Merged Result</div>
            <div class="merge-result-content">
              <Show when={mergedResult()} fallback={
                <div class="merge-result-pending">
                  Resolve all {unresolvedCount()} remaining conflicts to see merged result
                </div>
              }>
                <For each={(mergedResult() ?? "").split("\n")}>
                  {(line, i) => (
                    <div class="merge-line">
                      <span class="merge-line-num">{i() + 1}</span>
                      <span class="merge-line-content">{line}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <style>{`
        .merge-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
        }
        .merge-panel {
          width: 1100px;
          max-width: 95vw;
          max-height: 90vh;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .merge-header {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .merge-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .merge-filename {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .merge-conflict-count {
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .merge-header-right {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .merge-nav-btn {
          height: 26px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
        }
        .merge-nav-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }
        .merge-nav-btn:hover:not(:disabled) {
          color: var(--text-primary);
          border-color: var(--text-tertiary);
        }
        .merge-nav-label {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          min-width: 32px;
          text-align: center;
        }
        .merge-view-btn {
          height: 26px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
        }
        .merge-view-btn.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }
        .merge-accept-btn {
          height: 26px;
          padding: 0 var(--space-3);
          background: var(--accent-green);
          border: none;
          border-radius: var(--radius-sm);
          color: white;
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
        }
        .merge-accept-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }
        .merge-accept-btn:hover:not(:disabled) {
          filter: brightness(1.1);
        }
        .merge-close {
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
        .merge-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .merge-conflict-bar {
          display: flex;
          gap: 3px;
          padding: var(--space-2) var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .merge-conflict-pip {
          flex: 1;
          height: 6px;
          border-radius: 3px;
          cursor: pointer;
          opacity: 0.6;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .merge-conflict-pip.active {
          opacity: 1;
          transform: scaleY(1.5);
        }
        .merge-conflict-pip:hover {
          opacity: 0.9;
        }
        .merge-body {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .merge-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .merge-pane-header {
          height: 32px;
          display: flex;
          align-items: center;
          padding: 0 var(--space-3);
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .merge-pane-header.current {
          color: var(--accent-green);
          background: rgba(48, 209, 88, 0.06);
          border-bottom-color: rgba(48, 209, 88, 0.2);
        }
        .merge-pane-header.incoming {
          color: var(--accent-blue);
          background: rgba(41, 151, 255, 0.06);
          border-bottom-color: rgba(41, 151, 255, 0.2);
        }
        .merge-pane-header.result {
          color: var(--accent-purple);
          background: rgba(191, 90, 242, 0.06);
          border-bottom-color: rgba(191, 90, 242, 0.2);
        }
        .merge-pane-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2);
        }
        .merge-center {
          width: 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          border-left: 1px solid var(--border-subtle);
          border-right: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .merge-center-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
        }
        .merge-center-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .merge-center-btn {
          width: 56px;
          height: 24px;
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 10px;
          cursor: pointer;
        }
        .merge-center-btn.selected {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }
        .merge-center-btn.reset {
          border-color: var(--accent-red);
          color: var(--accent-red);
        }
        .merge-center-btn:hover {
          color: var(--text-primary);
        }
        .merge-conflict-block {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .merge-block-actions {
          display: flex;
          gap: var(--space-1);
          margin-bottom: var(--space-1);
        }
        .merge-resolve-btn {
          height: 24px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 10px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .merge-resolve-btn:hover {
          color: var(--text-primary);
          border-color: var(--text-secondary);
        }
        .merge-resolve-btn.selected {
          background: var(--accent-green);
          border-color: var(--accent-green);
          color: white;
        }
        .merge-pane:last-child .merge-resolve-btn.selected {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
        }
        .merge-lines {
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .merge-lines.current {
          background: rgba(48, 209, 88, 0.04);
          border: 1px solid rgba(48, 209, 88, 0.15);
        }
        .merge-lines.incoming {
          background: rgba(41, 151, 255, 0.04);
          border: 1px solid rgba(41, 151, 255, 0.15);
        }
        .merge-line {
          display: flex;
          min-height: 22px;
          align-items: stretch;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        .merge-line-num {
          width: 36px;
          text-align: right;
          padding-right: var(--space-2);
          color: var(--text-disabled);
          user-select: none;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .merge-line-content {
          flex: 1;
          white-space: pre;
          padding-right: var(--space-2);
          color: var(--text-primary);
          display: flex;
          align-items: center;
        }
        .merge-empty {
          padding: var(--space-2) var(--space-3);
          font-size: var(--text-xs);
          color: var(--text-disabled);
          font-style: italic;
        }
        .merge-result {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .merge-result-content {
          flex: 1;
          overflow-y: auto;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          line-height: 1.6;
        }
        .merge-result-pending {
          padding: var(--space-4);
          text-align: center;
          color: var(--text-tertiary);
          font-size: var(--text-xs);
        }
      `}</style>
    </div>
  );
}
