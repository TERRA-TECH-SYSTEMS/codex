// ============================================================================
// CodeEX v2 — Git Blame Integration
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Inline blame annotations in the editor gutter and line decorations.
// Uses TerraRuntime run_command to execute git blame.
// ============================================================================

import { EditorView, Decoration, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSet, StateField, StateEffect, type Extension } from "@codemirror/state";

// ============================================================================
// Types
// ============================================================================

export interface BlameEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  summary: string;
  line: number;
}

// ============================================================================
// State
// ============================================================================

let blameEnabled = true;
let blameCache = new Map<string, BlameEntry[]>();

export function isBlameEnabled(): boolean {
  return blameEnabled;
}

export function toggleBlameEnabled(): void {
  blameEnabled = !blameEnabled;
  document.dispatchEvent(new CustomEvent("codex:blame-toggled", {
    detail: { enabled: blameEnabled },
  }));
}

export function clearBlameCache(): void {
  blameCache.clear();
}

// ============================================================================
// Git Blame Fetcher
// ============================================================================

async function fetchBlame(filePath: string): Promise<BlameEntry[]> {
  // Check cache first
  const cached = blameCache.get(filePath);
  if (cached) return cached;

  try {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) return [];

    // Use git blame --line-porcelain for parseable output
    const normalizedPath = filePath.replace(/\\/g, "/");
    const output: string = await tr.core.invoke("run_command", {
      command: `git blame --line-porcelain "${normalizedPath}"`,
    });

    const entries = parseBlamePorcelain(output);
    blameCache.set(filePath, entries);
    return entries;
  } catch {
    return [];
  }
}

function parseBlamePorcelain(output: string): BlameEntry[] {
  const entries: BlameEntry[] = [];
  const lines = output.split("\n");
  let i = 0;

  while (i < lines.length) {
    const headerLine = lines[i];
    if (!headerLine || headerLine.startsWith("\t")) {
      i++;
      continue;
    }

    // Header: <hash> <orig-line> <final-line> [<group-lines>]
    const headerMatch = headerLine.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const hash = headerMatch[1];
    const lineNum = parseInt(headerMatch[2], 10);
    let author = "";
    let date = "";
    let summary = "";

    i++;

    // Read annotation fields until we hit a tab (content line)
    while (i < lines.length && !lines[i].startsWith("\t")) {
      const line = lines[i];
      if (line.startsWith("author ")) {
        author = line.substring(7);
      } else if (line.startsWith("author-time ")) {
        const ts = parseInt(line.substring(12), 10);
        date = formatRelativeTime(ts);
      } else if (line.startsWith("summary ")) {
        summary = line.substring(8);
      }
      i++;
    }

    // Skip the content line (starts with tab)
    if (i < lines.length && lines[i].startsWith("\t")) {
      i++;
    }

    // Only add non-uncommitted entries
    if (hash !== "0000000000000000000000000000000000000000") {
      entries.push({
        hash,
        shortHash: hash.substring(0, 7),
        author,
        date,
        summary,
        line: lineNum,
      });
    } else {
      entries.push({
        hash: "0000000",
        shortHash: "0000000",
        author: "You",
        date: "Now",
        summary: "Uncommitted change",
        line: lineNum,
      });
    }
  }

  return entries;
}

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

// ============================================================================
// CodeMirror Extensions
// ============================================================================

// State Effect for blame data
const setBlameData = StateEffect.define<BlameEntry[]>();

// State Field holding blame entries
const blameState = StateField.define<BlameEntry[]>({
  create() { return []; },
  update(val, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlameData)) {
        return effect.value;
      }
    }
    return val;
  },
});

// Gutter marker showing blame annotation
class BlameGutterMarker extends GutterMarker {
  constructor(private entry: BlameEntry) {
    super();
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-blame-annotation";
    el.textContent = `${this.entry.author}, ${this.entry.date}`;
    el.title = `${this.entry.shortHash} — ${this.entry.summary}\n${this.entry.author}, ${this.entry.date}`;
    return el;
  }
}

// Blame gutter markers field
const blameGutterMarkers = StateField.define<RangeSet<GutterMarker>>({
  create() { return RangeSet.empty; },
  update(set, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlameData)) {
        const entries = effect.value;
        if (entries.length === 0) return RangeSet.empty;

        const markers: { from: number; value: GutterMarker }[] = [];
        // Only show blame for the first line of each unique commit in sequence
        let prevHash = "";
        for (const entry of entries) {
          if (entry.line >= 1 && entry.line <= tr.state.doc.lines) {
            if (entry.hash !== prevHash) {
              const line = tr.state.doc.line(entry.line);
              markers.push({ from: line.from, value: new BlameGutterMarker(entry) });
            }
            prevHash = entry.hash;
          }
        }

        return RangeSet.of(markers.map((m) => m.value.range(m.from)), true);
      }
    }
    return set.map(tr.changes);
  },
});

// Blame gutter column
const blameGutter = gutter({
  class: "cm-blame-gutter",
  markers: (view) => view.state.field(blameGutterMarkers),
});

// Plugin to fetch and sync blame data
function blameSyncPlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private unlisten: (() => void) | null = null;

      constructor(private view: EditorView) {
        this.loadBlame();

        // Listen for blame toggle
        const handler = () => {
          if (blameEnabled) this.loadBlame();
          else this.clearBlame();
        };
        document.addEventListener("codex:blame-toggled", handler);
        this.unlisten = () => document.removeEventListener("codex:blame-toggled", handler);
      }

      private async loadBlame() {
        if (!blameEnabled) return;
        const entries = await fetchBlame(filePath);
        if (entries.length > 0) {
          this.view.dispatch({ effects: setBlameData.of(entries) });
        }
      }

      private clearBlame() {
        this.view.dispatch({ effects: setBlameData.of([]) });
      }

      update(_update: ViewUpdate) {
        // No-op — blame loaded once per file
      }

      destroy() {
        this.unlisten?.();
      }
    }
  );
}

// Theme
const blameTheme = EditorView.theme({
  ".cm-blame-gutter": {
    width: "180px",
    borderRight: "1px solid rgba(255,255,255,0.06)",
  },
  ".cm-blame-annotation": {
    fontSize: "10px",
    fontFamily: "var(--font-mono)",
    color: "rgba(255,255,255,0.25)",
    paddingRight: "8px",
    textAlign: "right",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "inherit",
  },
}, { dark: true });

// ============================================================================
// Combined Extension Bundle
// ============================================================================

export function blameExtensions(filePath: string): Extension[] {
  if (!blameEnabled) return [];
  return [
    blameState,
    blameGutterMarkers,
    blameGutter,
    blameSyncPlugin(filePath),
    blameTheme,
  ];
}
