// ============================================================================
// CodeEX v2 — Output Panel
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Displays build output, ageixt logs, and system messages.
// Receives entries via codex:output-log custom events.
// ============================================================================

import { createSignal, For, Show, onMount, onCleanup } from "solid-js";

interface Props {
  visible: boolean;
  height?: number;
}

interface OutputEntry {
  timestamp: number;
  channel: string;
  message: string;
  level: "info" | "warn" | "error" | "debug";
}

export function OutputPanel(props: Props) {
  const [entries, setEntries] = createSignal<OutputEntry[]>([]);
  const [filter, setFilter] = createSignal<string>("all");
  let listRef: HTMLDivElement | undefined;

  const channels = () => {
    const set = new Set(entries().map((e) => e.channel));
    return ["all", ...Array.from(set).sort()];
  };

  const filtered = () => {
    const f = filter();
    if (f === "all") return entries();
    return entries().filter((e) => e.channel === f);
  };

  const addEntry = (channel: string, message: string, level: OutputEntry["level"] = "info") => {
    setEntries((prev) => {
      const next = [...prev, { timestamp: Date.now(), channel, message, level }];
      if (next.length > 2000) return next.slice(-1500);
      return next;
    });
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      if (listRef) listRef.scrollTop = listRef.scrollHeight;
    });
  };

  // Listen for output events
  const handleOutput = ((e: CustomEvent<{ channel: string; message: string; level?: string }>) => {
    addEntry(e.detail.channel, e.detail.message, (e.detail.level as OutputEntry["level"]) || "info");
  }) as EventListener;

  // Listen for ageixt tool execution logs
  const handleToolLog = ((e: CustomEvent<{ tool: string; input: string; output: string }>) => {
    addEntry("Gixsis Ageixt", `[${e.detail.tool}] ${e.detail.output}`, "info");
  }) as EventListener;

  onMount(() => {
    document.addEventListener("codex:output-log", handleOutput);
    document.addEventListener("codex:tool-log", handleToolLog);
    // Initial entry
    addEntry("System", "CodeEX v2 Output — Ready", "info");
  });
  onCleanup(() => {
    document.removeEventListener("codex:output-log", handleOutput);
    document.removeEventListener("codex:tool-log", handleToolLog);
  });

  const levelColor = (level: string) => {
    switch (level) {
      case "error": return "var(--accent-red)";
      case "warn": return "var(--accent-orange)";
      case "debug": return "var(--text-disabled)";
      default: return "var(--text-secondary)";
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <div
      class="output-panel"
      style={{
        display: props.visible ? "flex" : "none",
        height: props.height ? `${props.height}px` : "200px",
      }}
    >
      {/* Toolbar */}
      <div class="output-toolbar">
        <div class="output-channels">
          <For each={channels()}>
            {(ch) => (
              <button
                class={`output-channel ${filter() === ch ? "active" : ""}`}
                onClick={() => setFilter(ch)}
              >
                {ch === "all" ? "All" : ch}
              </button>
            )}
          </For>
        </div>
        <button class="output-clear-btn" onClick={() => setEntries([])}>Clear</button>
      </div>

      {/* Log entries */}
      <div class="output-list" ref={listRef}>
        <Show when={filtered().length === 0}>
          <div class="output-empty">No output</div>
        </Show>
        <For each={filtered()}>
          {(entry) => (
            <div class="output-line">
              <span class="output-time">{formatTime(entry.timestamp)}</span>
              <span class="output-channel-tag">[{entry.channel}]</span>
              <span class="output-msg" style={{ color: levelColor(entry.level) }}>
                {entry.message}
              </span>
            </div>
          )}
        </For>
      </div>

      <style>{`
        .output-panel {
          flex-direction: column;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          overflow: hidden;
        }
        .output-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 28px;
          padding: 0 var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .output-channels {
          display: flex;
          align-items: center;
          gap: 2px;
          overflow-x: auto;
        }
        .output-channel {
          height: 22px;
          padding: 0 var(--space-2);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .output-channel:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }
        .output-channel.active {
          background: rgba(41, 151, 255, 0.1);
          color: var(--accent-blue);
        }
        .output-clear-btn {
          height: 20px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 10px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .output-clear-btn:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }
        .output-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-1) 0;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.5;
        }
        .output-empty {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-align: center;
          padding: var(--space-4);
          font-style: italic;
        }
        .output-line {
          display: flex;
          gap: var(--space-2);
          padding: 0 var(--space-3);
          min-height: 20px;
          align-items: baseline;
        }
        .output-line:hover {
          background: var(--bg-hover);
        }
        .output-time {
          color: var(--text-disabled);
          font-size: 10px;
          flex-shrink: 0;
        }
        .output-channel-tag {
          color: var(--accent-blue);
          font-size: 11px;
          flex-shrink: 0;
        }
        .output-msg {
          flex: 1;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}
