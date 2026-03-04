// ============================================================================
// CodeEX v2 — Search Editor Tab
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Displays search results in a read-only editor tab format, similar to
// VS Code's Search Editor. Clickable result lines navigate to the file.
// ============================================================================

import { createSignal, For, Show, onMount } from "solid-js";

interface SearchResult {
  file: string;
  line: number;
  col: number;
  text: string;
}

interface Props {
  query: string;
  results: SearchResult[];
  onOpenFile?: (path: string, line?: number) => void;
}

export function SearchEditor(props: Props) {
  const groupedResults = () => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of props.results) {
      const arr = groups.get(r.file) ?? [];
      arr.push(r);
      groups.set(r.file, arr);
    }
    return Array.from(groups.entries());
  };

  return (
    <div class="search-editor">
      <div class="search-editor-header">
        <span class="search-editor-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </span>
        <span class="search-editor-title">Search Results: "{props.query}"</span>
        <span class="search-editor-count">{props.results.length} results in {groupedResults().length} files</span>
      </div>

      <div class="search-editor-body">
        <For each={groupedResults()}>
          {([file, results]) => (
            <div class="search-editor-file-group">
              <div
                class="search-editor-file-header"
                onClick={() => props.onOpenFile?.(file)}
              >
                {file}
                <span class="search-editor-file-count">{results.length}</span>
              </div>
              <For each={results}>
                {(result) => (
                  <div
                    class="search-editor-result-line"
                    onClick={() => props.onOpenFile?.(result.file, result.line)}
                  >
                    <span class="search-editor-line-num">{result.line}</span>
                    <span class="search-editor-line-text">{result.text}</span>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
        <Show when={props.results.length === 0}>
          <div class="search-editor-empty">No results found for "{props.query}"</div>
        </Show>
      </div>

      <style>{`
        .search-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-primary);
        }
        .search-editor-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .search-editor-icon { color: var(--text-tertiary); display: flex; }
        .search-editor-title {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
        }
        .search-editor-count {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-left: auto;
        }
        .search-editor-body {
          flex: 1;
          overflow-y: auto;
          font-family: 'JetBrains Mono', 'SF Mono', monospace;
          font-size: 12px;
        }
        .search-editor-file-group {
          margin-bottom: var(--space-1);
        }
        .search-editor-file-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-1) var(--space-3);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--bg-surface);
          cursor: pointer;
          user-select: none;
        }
        .search-editor-file-header:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .search-editor-file-count {
          font-size: 10px;
          color: var(--text-disabled);
          background: var(--bg-hover);
          padding: 0 6px;
          border-radius: 10px;
        }
        .search-editor-result-line {
          display: flex;
          align-items: baseline;
          gap: var(--space-2);
          padding: 1px var(--space-3) 1px var(--space-5);
          cursor: pointer;
          line-height: 20px;
        }
        .search-editor-result-line:hover {
          background: var(--bg-hover);
        }
        .search-editor-line-num {
          color: var(--text-disabled);
          min-width: 40px;
          text-align: right;
          flex-shrink: 0;
        }
        .search-editor-line-text {
          color: var(--text-primary);
          white-space: pre;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .search-editor-empty {
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
