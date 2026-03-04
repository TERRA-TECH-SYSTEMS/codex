// ============================================================================
// CodeEX v2 — Go to Symbol (Ctrl+Shift+O)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Quick symbol picker overlay for navigating to functions, classes, types,
// interfaces, enums, and variables in the current file.
// ============================================================================

import { createSignal, For, onMount } from "solid-js";

interface SymbolEntry {
  name: string;
  kind: string;
  line: number;
  icon: string;
  color: string;
}

interface Props {
  symbols: SymbolEntry[];
  onGo: (line: number) => void;
  onClose: () => void;
}

const kindIcon = (kind: string): { icon: string; color: string } => {
  switch (kind) {
    case "function": return { icon: "\u0192", color: "var(--accent-blue)" };
    case "class": return { icon: "C", color: "var(--accent-orange)" };
    case "interface": return { icon: "I", color: "var(--accent-green)" };
    case "type": return { icon: "T", color: "var(--accent-purple, #bf5af2)" };
    case "enum": return { icon: "E", color: "var(--accent-orange)" };
    case "variable": return { icon: "V", color: "var(--accent-blue)" };
    case "const": return { icon: "K", color: "var(--accent-blue)" };
    case "method": return { icon: "M", color: "var(--accent-blue)" };
    case "property": return { icon: "P", color: "var(--text-secondary)" };
    default: return { icon: "S", color: "var(--text-tertiary)" };
  }
};

export function GoToSymbol(props: Props) {
  const [query, setQuery] = createSignal("");
  const [selectedIdx, setSelectedIdx] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  const filtered = () => {
    const q = query().toLowerCase();
    if (!q) return props.symbols;
    return props.symbols.filter((s) =>
      s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q)
    );
  };

  const go = (idx: number) => {
    const items = filtered();
    if (idx >= 0 && idx < items.length) {
      props.onGo(items[idx].line);
      props.onClose();
    }
  };

  onMount(() => inputRef?.focus());

  return (
    <div class="goto-symbol-overlay" onClick={props.onClose}>
      <div class="goto-symbol-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="goto-symbol-input"
          type="text"
          placeholder="@  Go to symbol..."
          value={query()}
          onInput={(e) => { setQuery(e.currentTarget.value); setSelectedIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") props.onClose();
            if (e.key === "Enter") go(selectedIdx());
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedIdx((i) => Math.min(i + 1, filtered().length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedIdx((i) => Math.max(i - 1, 0));
            }
          }}
        />
        <div class="goto-symbol-list">
          <For each={filtered()}>
            {(sym, i) => {
              const ki = kindIcon(sym.kind);
              return (
                <div
                  class={`goto-symbol-item ${i() === selectedIdx() ? "selected" : ""}`}
                  onClick={() => go(i())}
                  onMouseEnter={() => setSelectedIdx(i())}
                >
                  <span class="goto-symbol-kind" style={{ color: ki.color }}>{ki.icon}</span>
                  <span class="goto-symbol-name">{sym.name}</span>
                  <span class="goto-symbol-type">{sym.kind}</span>
                  <span class="goto-symbol-line">:{sym.line}</span>
                </div>
              );
            }}
          </For>
          {filtered().length === 0 && (
            <div class="goto-symbol-empty">No symbols found</div>
          )}
        </div>
      </div>

      <style>{`
        .goto-symbol-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          justify-content: center;
          padding-top: 80px;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
        }
        .goto-symbol-panel {
          width: 480px;
          max-height: 360px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .goto-symbol-input {
          width: 100%;
          height: 44px;
          padding: 0 var(--space-4);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-md);
          outline: none;
        }
        .goto-symbol-input::placeholder {
          color: var(--text-disabled);
        }
        .goto-symbol-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-1) 0;
        }
        .goto-symbol-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 32px;
          padding: 0 var(--space-4);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .goto-symbol-item:hover,
        .goto-symbol-item.selected {
          background: var(--bg-hover);
        }
        .goto-symbol-kind {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
          flex-shrink: 0;
        }
        .goto-symbol-name {
          font-size: var(--text-sm);
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .goto-symbol-type {
          font-size: 10px;
          color: var(--text-disabled);
          flex-shrink: 0;
        }
        .goto-symbol-line {
          font-size: 10px;
          color: var(--text-disabled);
          font-family: var(--font-mono);
          flex-shrink: 0;
        }
        .goto-symbol-empty {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-align: center;
          padding: var(--space-4);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
