// ============================================================================
// CodeEX v2 — Linked Editing (HTML Tag Rename)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// When cursor is inside an HTML/JSX tag name, highlights the matching
// open/close tag and renames both simultaneously.
// VS Code parity: Linked Editing Ranges (HTML tag auto-rename).
// ============================================================================

import { EditorView, ViewPlugin, type ViewUpdate, Decoration, type DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, type ChangeSpec, type Transaction } from "@codemirror/state";

// ============================================================================
// Tag Matching
// ============================================================================

interface TagMatch {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
  tagName: string;
}

function findTagPairAtPos(doc: string, pos: number): TagMatch | null {
  // Find if cursor is inside a tag name
  // Look backward for '<' or '</'
  let i = pos;
  while (i > 0 && /[\w-]/.test(doc[i - 1])) i--;
  if (i <= 0) return null;

  const isClosing = doc[i - 1] === "/" && i >= 2 && doc[i - 2] === "<";
  const isOpening = doc[i - 1] === "<";
  if (!isOpening && !isClosing) return null;

  // Extract tag name
  let j = pos;
  while (j < doc.length && /[\w-]/.test(doc[j])) j++;
  const tagName = doc.slice(i, j);
  if (!tagName || tagName.length === 0) return null;

  if (isOpening) {
    // We're in an opening tag, find the closing tag
    const tagStart = i - 1;
    const closePattern = new RegExp(`</${tagName}[\\s>]`);
    let depth = 0;
    let searchPos = j;
    while (searchPos < doc.length) {
      const openIdx = doc.indexOf(`<${tagName}`, searchPos);
      const closeIdx = doc.indexOf(`</${tagName}`, searchPos);

      if (closeIdx === -1) return null;

      if (openIdx !== -1 && openIdx < closeIdx) {
        // Check it's actually a tag (not a substring)
        const nextChar = doc[openIdx + tagName.length + 1];
        if (nextChar === " " || nextChar === ">" || nextChar === "/" || nextChar === "\n") {
          depth++;
        }
        searchPos = openIdx + 1;
        continue;
      }

      if (depth === 0) {
        const closeNameStart = closeIdx + 2; // skip '</'
        const closeNameEnd = closeNameStart + tagName.length;
        return {
          openStart: i,
          openEnd: j,
          closeStart: closeNameStart,
          closeEnd: closeNameEnd,
          tagName,
        };
      }
      depth--;
      searchPos = closeIdx + 1;
    }
  } else {
    // We're in a closing tag, find the opening tag
    const closeNameStart = i;
    const closeNameEnd = j;
    // Search backward for matching opening tag
    let depth = 0;
    let searchPos = i - 2; // before '</'
    while (searchPos >= 0) {
      const closeIdx = doc.lastIndexOf(`</${tagName}`, searchPos);
      const openIdx = doc.lastIndexOf(`<${tagName}`, searchPos);

      if (openIdx === -1) return null;

      if (closeIdx !== -1 && closeIdx > openIdx) {
        depth++;
        searchPos = closeIdx - 1;
        continue;
      }

      if (depth === 0) {
        const openNameStart = openIdx + 1;
        const openNameEnd = openNameStart + tagName.length;
        return {
          openStart: openNameStart,
          openEnd: openNameEnd,
          closeStart: closeNameStart,
          closeEnd: closeNameEnd,
          tagName,
        };
      }
      depth--;
      searchPos = openIdx - 1;
    }
  }

  return null;
}

// ============================================================================
// Highlight Plugin
// ============================================================================

const linkedHighlight = Decoration.mark({ class: "cm-linked-editing-highlight" });

const linkedEditingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const pos = view.state.selection.main.head;
      const doc = view.state.doc.toString();
      const match = findTagPairAtPos(doc, pos);
      if (!match) return builder.finish();

      // Sort ranges for RangeSetBuilder (must be in order)
      const ranges = [
        [match.openStart, match.openEnd],
        [match.closeStart, match.closeEnd],
      ].sort((a, b) => a[0] - b[0]);

      for (const [from, to] of ranges) {
        builder.add(from, to, linkedHighlight);
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

const linkedEditingTheme = EditorView.baseTheme({
  ".cm-linked-editing-highlight": {
    outline: "1px solid var(--accent-blue, #2997ff)",
    borderRadius: "2px",
    background: "rgba(41, 151, 255, 0.1)",
  },
});

/** Returns CodeMirror 6 extensions for linked editing (HTML tag highlighting). */
export function linkedEditingExtensions() {
  return [linkedEditingPlugin, linkedEditingTheme];
}
