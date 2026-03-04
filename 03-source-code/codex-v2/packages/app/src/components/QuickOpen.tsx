// ============================================================================
// CodeEX v2 — Quick Open File Picker (Ctrl+P)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, For, onMount } from "solid-js";
import { getFS } from "~/lib/filesystem";
import { getFileIcon } from "~/lib/file-icons";
import type { FileNode } from "~/lib/types";

interface Props {
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

/** Flatten a FileNode tree into a list of file paths. */
function flattenTree(nodes: FileNode[], prefix = ""): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      result.push(node.path);
    } else if (node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

/** Simple fuzzy match — checks if all query chars appear in order. */
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return { match: true, score: 0 };
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      if (lastMatchIdx === ti - 1) score += 2;
      // Bonus for matching after separator
      if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === "." || t[ti - 1] === "-" || t[ti - 1] === "_") score += 3;
      score += 1;
      lastMatchIdx = ti;
      qi++;
    }
  }
  return { match: qi === q.length, score };
}

export function QuickOpen(props: Props) {
  const [query, setQuery] = createSignal("");
  const [files, setFiles] = createSignal<string[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  onMount(async () => {
    inputRef?.focus();
    try {
      const tree = await getFS().readDir("", 6);
      setFiles(flattenTree(tree));
    } catch {
      setFiles([]);
    }
  });

  const filtered = () => {
    const q = query().trim();
    const all = files();
    if (!q) return all.slice(0, 50);
    const scored = all
      .map((f) => ({ path: f, ...fuzzyMatch(q, f) }))
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score);
    return scored.map((r) => r.path).slice(0, 50);
  };

  const openSelected = () => {
    const list = filtered();
    if (list.length > 0) {
      const idx = Math.min(selectedIndex(), list.length - 1);
      props.onOpenFile(list[idx]);
      props.onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered().length - 1));
      scrollToSelected();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      scrollToSelected();
    } else if (e.key === "Enter") {
      e.preventDefault();
      openSelected();
    } else if (e.key === "Escape") {
      props.onClose();
    }
  };

  const scrollToSelected = () => {
    requestAnimationFrame(() => {
      const el = listRef?.querySelector(".qo-item.selected") as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    });
  };

  const getIcon = (path: string) => {
    const name = path.split("/").pop() ?? path;
    const fi = getFileIcon(name);
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="${fi.color}" xmlns="http://www.w3.org/2000/svg"><path d="${fi.path}"/></svg>`;
  };

  return (
    <div class="qo-overlay" onClick={props.onClose}>
      <div class="qo-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="qo-input"
          type="text"
          placeholder="Search files by name..."
          value={query()}
          onInput={(e) => { setQuery(e.currentTarget.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <div class="qo-list" ref={listRef}>
          <For each={filtered()}>
            {(path, i) => {
              const name = () => path.split("/").pop() ?? path;
              const dir = () => {
                const parts = path.split("/");
                return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
              };
              return (
                <div
                  class={`qo-item ${i() === selectedIndex() ? "selected" : ""}`}
                  onClick={() => { props.onOpenFile(path); props.onClose(); }}
                  onMouseEnter={() => setSelectedIndex(i())}
                >
                  <span class="qo-icon" innerHTML={getIcon(path)} />
                  <span class="qo-name">{name()}</span>
                  <span class="qo-path">{dir()}</span>
                </div>
              );
            }}
          </For>
          {filtered().length === 0 && (
            <div class="qo-empty">No files found</div>
          )}
        </div>
      </div>

      <style>{`
        .qo-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          justify-content: center;
          padding-top: 80px;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
        }
        .qo-panel {
          width: 560px;
          max-height: 400px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .qo-input {
          width: 100%;
          height: 48px;
          padding: 0 var(--space-4);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-md);
          outline: none;
        }
        .qo-input::placeholder {
          color: var(--text-disabled);
        }
        .qo-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-1) 0;
        }
        .qo-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 32px;
          padding: 0 var(--space-4);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .qo-item:hover,
        .qo-item.selected {
          background: var(--bg-hover);
        }
        .qo-icon {
          flex-shrink: 0;
          width: 16px;
          display: flex;
          align-items: center;
        }
        .qo-name {
          font-size: var(--text-sm);
          color: var(--text-primary);
          font-weight: 500;
          flex-shrink: 0;
        }
        .qo-path {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-left: var(--space-2);
        }
        .qo-empty {
          padding: var(--space-4);
          text-align: center;
          color: var(--text-disabled);
          font-size: var(--text-sm);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
