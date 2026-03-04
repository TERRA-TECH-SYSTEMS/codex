// ============================================================================
// CodeEX v2 — Code Actions Lightbulb
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Shows a lightbulb icon in the gutter when code actions are available
// at the current cursor position (quick fixes, refactoring suggestions).
// VS Code parity: Code Actions lightbulb indicator.
// ============================================================================

import { EditorView, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, RangeSet, RangeSetBuilder } from "@codemirror/state";

// ============================================================================
// Lightbulb Marker
// ============================================================================

class LightbulbMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-lightbulb";
    el.innerHTML = "💡";
    el.title = "Code Actions Available";
    return el;
  }
}

const lightbulbMarker = new LightbulbMarker();

// ============================================================================
// State
// ============================================================================

export const setCodeActions = StateEffect.define<number[]>();

const codeActionsField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCodeActions)) {
        const builder = new RangeSetBuilder<GutterMarker>();
        const sorted = [...e.value].sort((a, b) => a - b);
        for (const lineNum of sorted) {
          if (lineNum < 1 || lineNum > tr.state.doc.lines) continue;
          const pos = tr.state.doc.line(lineNum).from;
          builder.add(pos, pos, lightbulbMarker);
        }
        return builder.finish();
      }
    }
    if (tr.docChanged) return value.map(tr.changes);
    return value;
  },
});

// ============================================================================
// Simple heuristic: detect lines that might have quick fixes
// ============================================================================

function detectActionLines(doc: string, cursorLine: number): number[] {
  const lines = doc.split("\n");
  const actionLines: number[] = [];

  // Show lightbulb on current line if it has patterns that suggest fixable issues
  if (cursorLine >= 1 && cursorLine <= lines.length) {
    const line = lines[cursorLine - 1];
    // Unused import pattern
    if (/^\s*import\s/.test(line)) actionLines.push(cursorLine);
    // Console.log statements
    if (/console\.\w+\(/.test(line)) actionLines.push(cursorLine);
    // any type annotation
    if (/:\s*any\b/.test(line)) actionLines.push(cursorLine);
    // TODO/FIXME comments
    if (/\/\/\s*(TODO|FIXME|HACK)\b/i.test(line)) actionLines.push(cursorLine);
  }

  return [...new Set(actionLines)];
}

// ============================================================================
// Plugin that updates on cursor move
// ============================================================================

const codeActionsPlugin = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.update_(view);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged) {
        this.update_(update.view);
      }
    }
    update_(view: EditorView) {
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      const doc = view.state.doc.toString();
      const lines = detectActionLines(doc, cursorLine);
      view.dispatch({ effects: setCodeActions.of(lines) });
    }
  }
);

// ============================================================================
// Gutter + Theme
// ============================================================================

const codeActionsGutter = gutter({
  class: "cm-code-actions-gutter",
  markers: (view) => view.state.field(codeActionsField),
});

const codeActionsTheme = EditorView.baseTheme({
  ".cm-code-actions-gutter": {
    width: "16px",
    minWidth: "16px",
  },
  ".cm-lightbulb": {
    fontSize: "12px",
    lineHeight: "1",
    cursor: "pointer",
    opacity: "0.7",
    transition: "opacity 0.15s",
  },
  ".cm-lightbulb:hover": {
    opacity: "1",
  },
});

/** Returns CodeMirror 6 extensions for Code Actions lightbulb. */
export function codeActionsExtensions() {
  return [codeActionsField, codeActionsGutter, codeActionsPlugin, codeActionsTheme];
}
