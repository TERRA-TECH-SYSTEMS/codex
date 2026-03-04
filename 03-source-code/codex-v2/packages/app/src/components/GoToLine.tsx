// ============================================================================
// CodeEX v2 — Go to Line Dialog (Ctrl+G)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, onMount } from "solid-js";

interface Props {
  maxLine: number;
  currentLine: number;
  onGo: (line: number) => void;
  onClose: () => void;
}

export function GoToLine(props: Props) {
  const [value, setValue] = createSignal(String(props.currentLine));
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
    inputRef?.select();
  });

  const handleSubmit = () => {
    const num = parseInt(value(), 10);
    if (!isNaN(num) && num >= 1 && num <= props.maxLine) {
      props.onGo(num);
      props.onClose();
    }
  };

  return (
    <div class="goto-overlay" onClick={props.onClose}>
      <div class="goto-dialog" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="goto-input"
          type="text"
          placeholder={`Go to Line (1–${props.maxLine})`}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") props.onClose();
          }}
        />
        <span class="goto-hint">
          Type a line number and press Enter
        </span>
      </div>

      <style>{`
        .goto-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          justify-content: center;
          padding-top: 80px;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
        }
        .goto-dialog {
          width: 400px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          height: fit-content;
        }
        .goto-input {
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
        .goto-input::placeholder {
          color: var(--text-disabled);
        }
        .goto-hint {
          padding: var(--space-2) var(--space-4);
          font-size: var(--text-xs);
          color: var(--text-disabled);
        }
      `}</style>
    </div>
  );
}
