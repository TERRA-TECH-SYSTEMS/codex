// ============================================================================
// CodeEX v2 — Tool Call Block (Ageixt Mode)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Renders a tool call result inside the chat — shows tool name, status,
// output preview, and a "View Diff" button for edit operations.
// ============================================================================

import { Show } from "solid-js";
import type { ToolResult } from "~/lib/agent-tools";

interface Props {
  result: ToolResult;
  onViewDiff?: (diff: NonNullable<ToolResult["diff"]>) => void;
  onAcceptEdit?: (path: string, newContent: string) => void;
}

const toolIcons: Record<string, string> = {
  read_file: "\u{1F4C4}",
  edit_file: "\u{270F}\u{FE0F}",
  create_file: "\u{2795}",
  search_files: "\u{1F50D}",
  list_files: "\u{1F4C2}",
  run_command: "\u{1F4BB}",
};

export function ToolCallBlock(props: Props) {
  const icon = () => toolIcons[props.result.name] ?? "\u{1F527}";
  const isEdit = () => props.result.name === "edit_file" || props.result.name === "create_file";
  const hasDiff = () => !!props.result.diff;
  const isError = () => props.result.status === "error";

  return (
    <div class={`tool-call-block ${isError() ? "error" : "success"}`}>
      <div class="tool-call-header">
        <span class="tool-call-icon">{icon()}</span>
        <span class="tool-call-name">{props.result.name}</span>
        <span class={`tool-call-status ${isError() ? "error" : "success"}`}>
          {isError() ? "failed" : "done"}
        </span>
        <Show when={hasDiff() && !isError()}>
          <button
            class="tool-call-diff-btn"
            onClick={() => props.onViewDiff?.(props.result.diff!)}
          >
            View Diff
          </button>
          <button
            class="tool-call-accept-btn"
            onClick={() => props.onAcceptEdit?.(props.result.diff!.fileName, props.result.diff!.newContent)}
          >
            Apply
          </button>
        </Show>
      </div>
      <div class="tool-call-output">
        <pre>{props.result.output.length > 500 ? props.result.output.slice(0, 500) + "\n..." : props.result.output}</pre>
      </div>

      <style>{`
        .tool-call-block {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin: var(--space-2) 0;
          overflow: hidden;
          font-size: var(--text-xs);
        }
        .tool-call-block.error {
          border-color: rgba(255, 69, 58, 0.3);
        }
        .tool-call-block.success {
          border-color: rgba(48, 209, 88, 0.2);
        }
        .tool-call-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
        }
        .tool-call-icon {
          font-size: 12px;
        }
        .tool-call-name {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--text-primary);
        }
        .tool-call-status {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 1px 6px;
          border-radius: 8px;
        }
        .tool-call-status.success {
          color: var(--accent-green);
          background: rgba(48, 209, 88, 0.1);
        }
        .tool-call-status.error {
          color: var(--accent-red);
          background: rgba(255, 69, 58, 0.1);
        }
        .tool-call-diff-btn, .tool-call-accept-btn {
          margin-left: auto;
          height: 22px;
          padding: 0 var(--space-2);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .tool-call-diff-btn:hover {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }
        .tool-call-accept-btn {
          margin-left: var(--space-1);
          color: var(--accent-green);
          border-color: rgba(48, 209, 88, 0.3);
        }
        .tool-call-accept-btn:hover {
          background: var(--accent-green);
          border-color: var(--accent-green);
          color: white;
        }
        .tool-call-output {
          padding: var(--space-2) var(--space-3);
          max-height: 200px;
          overflow-y: auto;
        }
        .tool-call-output pre {
          margin: 0;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
        }
        .tool-call-block.error .tool-call-output pre {
          color: var(--accent-red);
        }
      `}</style>
    </div>
  );
}
