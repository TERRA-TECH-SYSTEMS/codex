// ============================================================================
// CodeEX v2 — Git Gutter Indicators
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Shows colored bars in the editor gutter for added (green), modified (blue),
// and deleted (red) lines relative to the git HEAD version.
// VS Code parity: gutter change indicators.
// ============================================================================

import { EditorView, gutter, GutterMarker } from "@codemirror/view";
import { StateField, StateEffect, RangeSet, RangeSetBuilder } from "@codemirror/state";

// ============================================================================
// Gutter Markers
// ============================================================================

class GitGutterMarker extends GutterMarker {
  constructor(private type: "added" | "modified" | "deleted") {
    super();
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = `git-gutter-${this.type}`;
    return el;
  }
}

const addedMarker = new GitGutterMarker("added");
const modifiedMarker = new GitGutterMarker("modified");
const deletedMarker = new GitGutterMarker("deleted");

// ============================================================================
// State Effects & Field
// ============================================================================

export interface GitLineChange {
  line: number;
  type: "added" | "modified" | "deleted";
}

export const setGitChanges = StateEffect.define<GitLineChange[]>();

const gitGutterField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGitChanges)) {
        const builder = new RangeSetBuilder<GutterMarker>();
        const sorted = [...e.value].sort((a, b) => a.line - b.line);
        for (const change of sorted) {
          if (change.line < 1 || change.line > tr.state.doc.lines) continue;
          const pos = tr.state.doc.line(change.line).from;
          const marker = change.type === "added" ? addedMarker
            : change.type === "modified" ? modifiedMarker
            : deletedMarker;
          builder.add(pos, pos, marker);
        }
        return builder.finish();
      }
    }
    // Remap existing markers on doc changes
    if (tr.docChanged) {
      return value.map(tr.changes);
    }
    return value;
  },
});

// ============================================================================
// Gutter Extension
// ============================================================================

const gitGutterTheme = EditorView.baseTheme({
  ".git-gutter-added": {
    width: "3px",
    height: "100%",
    background: "var(--accent-green, #30d158)",
    borderRadius: "0 1px 1px 0",
  },
  ".git-gutter-modified": {
    width: "3px",
    height: "100%",
    background: "var(--accent-blue, #2997ff)",
    borderRadius: "0 1px 1px 0",
  },
  ".git-gutter-deleted": {
    width: "3px",
    height: "100%",
    background: "var(--accent-red, #ff453a)",
    borderRadius: "0 1px 1px 0",
  },
  ".cm-gutter.cm-git-gutter": {
    width: "4px",
    minWidth: "4px",
    borderRight: "none",
  },
});

const gitGutter = gutter({
  class: "cm-git-gutter",
  markers: (view) => view.state.field(gitGutterField),
});

/** Returns the git gutter extensions for CodeMirror 6. */
export function gitGutterExtensions() {
  return [gitGutterField, gitGutter, gitGutterTheme];
}

// ============================================================================
// Diff Computation (simple line-by-line diff)
// ============================================================================

/** Compute line changes between original and current content. */
export function computeGitChanges(original: string, current: string): GitLineChange[] {
  const origLines = original.split("\n");
  const currLines = current.split("\n");
  const changes: GitLineChange[] = [];

  const maxLen = Math.max(origLines.length, currLines.length);
  for (let i = 0; i < maxLen; i++) {
    const lineNum = i + 1;
    if (i >= origLines.length) {
      // Line added
      changes.push({ line: lineNum, type: "added" });
    } else if (i >= currLines.length) {
      // Line deleted — show marker on last line
      if (currLines.length > 0) {
        changes.push({ line: currLines.length, type: "deleted" });
      }
      break;
    } else if (origLines[i] !== currLines[i]) {
      changes.push({ line: lineNum, type: "modified" });
    }
  }

  return changes;
}
