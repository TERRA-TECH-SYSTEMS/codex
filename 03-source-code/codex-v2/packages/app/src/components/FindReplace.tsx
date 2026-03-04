// ============================================================================
// CodeEX v2 — Find & Replace Overlay (Ctrl+F / Ctrl+H)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, Show, onMount, onCleanup } from "solid-js";

interface Props {
  onClose: () => void;
}

export function FindReplace(props: Props) {
  const [query, setQuery] = createSignal("");
  const [replaceText, setReplaceText] = createSignal("");
  const [showReplace, setShowReplace] = createSignal(false);
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [wholeWord, setWholeWord] = createSignal(false);
  const [useRegex, setUseRegex] = createSignal(false);
  const [preserveCase, setPreserveCase] = createSignal(false);
  const [matchCount, setMatchCount] = createSignal(0);
  const [currentMatch, setCurrentMatch] = createSignal(0);
  let findInputRef: HTMLInputElement | undefined;

  // Dispatch find events to the editor
  const dispatchFind = (q: string) => {
    document.dispatchEvent(new CustomEvent("codex:find", {
      detail: { query: q, caseSensitive: caseSensitive(), wholeWord: wholeWord(), useRegex: useRegex() },
    }));
  };

  const findNext = () => {
    document.dispatchEvent(new CustomEvent("codex:find-next"));
    setCurrentMatch((c) => Math.min(c + 1, matchCount()));
  };

  const findPrev = () => {
    document.dispatchEvent(new CustomEvent("codex:find-prev"));
    setCurrentMatch((c) => Math.max(c - 1, 1));
  };

  const replaceOne = () => {
    document.dispatchEvent(new CustomEvent("codex:replace-one", {
      detail: { replaceWith: replaceText(), preserveCase: preserveCase() },
    }));
  };

  const replaceAll = () => {
    document.dispatchEvent(new CustomEvent("codex:replace-all", {
      detail: { replaceWith: replaceText(), preserveCase: preserveCase() },
    }));
  };

  // Update match count from editor
  const handleMatchCount = ((e: CustomEvent<{ count: number; current: number }>) => {
    setMatchCount(e.detail.count);
    setCurrentMatch(e.detail.current);
  }) as EventListener;
  document.addEventListener("codex:match-count", handleMatchCount);
  onCleanup(() => document.removeEventListener("codex:match-count", handleMatchCount));

  // Toggle replace with Ctrl+H
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "h") {
      e.preventDefault();
      setShowReplace(true);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("codex:find-clear"));
      props.onClose();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      findNext();
    }
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      findPrev();
    }
  };

  onMount(() => {
    findInputRef?.focus();
    findInputRef?.select();
  });

  return (
    <div class="find-replace-bar" onKeyDown={handleKeyDown}>
      <div class="find-row">
        <button
          class="find-toggle-replace"
          onClick={() => setShowReplace((v) => !v)}
          title={showReplace() ? "Hide Replace" : "Show Replace (Ctrl+H)"}
        >
          <span style={{ transform: showReplace() ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 150ms" }}>&#9654;</span>
        </button>

        <div class="find-input-group">
          <input
            ref={findInputRef}
            class="find-input"
            type="text"
            placeholder="Find"
            value={query()}
            onInput={(e) => {
              const q = e.currentTarget.value;
              setQuery(q);
              dispatchFind(q);
            }}
          />
          <div class="find-options">
            <button
              class={`find-option ${caseSensitive() ? "active" : ""}`}
              onClick={() => { setCaseSensitive((v) => !v); dispatchFind(query()); }}
              title="Match Case"
            >Aa</button>
            <button
              class={`find-option ${wholeWord() ? "active" : ""}`}
              onClick={() => { setWholeWord((v) => !v); dispatchFind(query()); }}
              title="Match Whole Word"
            >Ab</button>
            <button
              class={`find-option ${useRegex() ? "active" : ""}`}
              onClick={() => { setUseRegex((v) => !v); dispatchFind(query()); }}
              title="Use Regular Expression"
            >.*</button>
          </div>
        </div>

        <span class="find-count">
          {matchCount() > 0 ? `${currentMatch()} of ${matchCount()}` : "No results"}
        </span>

        <button class="find-nav-btn" onClick={findPrev} title="Previous Match (Shift+Enter)">&#9650;</button>
        <button class="find-nav-btn" onClick={findNext} title="Next Match (Enter)">&#9660;</button>
        <button class="find-close-btn" onClick={() => { document.dispatchEvent(new CustomEvent("codex:find-clear")); props.onClose(); }} title="Close (Escape)">&times;</button>
      </div>

      <Show when={showReplace()}>
        <div class="replace-row">
          <div class="find-toggle-replace" style={{ visibility: "hidden" }}>&#9654;</div>
          <div class="find-input-group">
            <input
              class="find-input replace-input"
              type="text"
              placeholder="Replace"
              value={replaceText()}
              onInput={(e) => setReplaceText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); replaceOne(); }
                if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); replaceAll(); }
              }}
            />
            <div class="find-options">
              <button
                class={`find-option ${preserveCase() ? "active" : ""}`}
                onClick={() => setPreserveCase((v) => !v)}
                title="Preserve Case"
              >AB</button>
            </div>
          </div>
          <button class="find-action-btn" onClick={replaceOne} title="Replace (Enter)">Replace</button>
          <button class="find-action-btn" onClick={replaceAll} title="Replace All (Shift+Enter)">All</button>
        </div>
      </Show>

      <style>{`
        .find-replace-bar {
          position: absolute;
          top: 0;
          right: 80px;
          z-index: 10;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-top: none;
          border-radius: 0 0 var(--radius-md) var(--radius-md);
          box-shadow: var(--shadow-elevated);
          padding: var(--space-2);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          min-width: 380px;
        }
        .find-row, .replace-row {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 28px;
        }
        .find-toggle-replace {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 8px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .find-toggle-replace:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }
        .find-input-group {
          flex: 1;
          display: flex;
          align-items: center;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .find-input-group:focus-within {
          border-color: var(--accent-blue);
        }
        .find-input {
          flex: 1;
          height: 24px;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          padding: 0 var(--space-2);
          outline: none;
          min-width: 0;
        }
        .find-input::placeholder {
          color: var(--text-disabled);
        }
        .find-options {
          display: flex;
          gap: 1px;
          padding-right: 2px;
          flex-shrink: 0;
        }
        .find-option {
          width: 24px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          color: var(--text-disabled);
          font-size: 10px;
          font-weight: 600;
          font-family: var(--font-mono);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .find-option:hover {
          color: var(--text-secondary);
          background: var(--bg-hover);
        }
        .find-option.active {
          color: white;
          background: var(--accent-blue);
          border-color: var(--accent-blue);
        }
        .find-count {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          font-family: var(--font-mono);
          min-width: 70px;
          text-align: center;
          flex-shrink: 0;
        }
        .find-nav-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 10px;
          flex-shrink: 0;
        }
        .find-nav-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .find-close-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 16px;
          flex-shrink: 0;
        }
        .find-close-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .find-action-btn {
          height: 22px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: var(--text-xs);
          cursor: pointer;
          flex-shrink: 0;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .find-action-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--accent-blue);
        }
      `}</style>
    </div>
  );
}
