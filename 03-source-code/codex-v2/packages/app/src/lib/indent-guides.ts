// ============================================================================
// CodeEX v2 — Indentation Guide Lines
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Enhanced indentation guide lines with active scope highlighting.
// VS Code parity: colored active indent guides.
// ============================================================================

import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// ============================================================================
// Plugin
// ============================================================================

const indentGuide = Decoration.line({ class: "cm-indent-guide" });
const indentGuideActive = Decoration.line({ class: "cm-indent-guide cm-indent-guide-active" });

function buildIndentDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const doc = view.state.doc;

  // Find the indentation level of the cursor line
  const cursorLineText = doc.line(cursorLine).text;
  const cursorIndent = cursorLineText.search(/\S/);

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const indent = text.search(/\S/);
    if (indent > 0) {
      // Active if within the same indentation scope as cursor
      const isActive = indent <= cursorIndent && Math.abs(i - cursorLine) <= 50;
      builder.add(line.from, line.from, isActive ? indentGuideActive : indentGuide);
    }
  }

  return builder.finish();
}

const indentGuidesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildIndentDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildIndentDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const indentGuidesTheme = EditorView.baseTheme({
  ".cm-indent-guide": {
    borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
  },
  ".cm-indent-guide-active": {
    borderLeft: "1px solid rgba(255, 255, 255, 0.15)",
  },
});

/** Returns CodeMirror 6 extensions for enhanced indentation guides. */
export function indentGuidesExtensions() {
  return [indentGuidesPlugin, indentGuidesTheme];
}
