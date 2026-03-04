// ============================================================================
// CodeEX v2 — Code Lens Extension
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Inline annotations above functions/classes showing reference counts.
// VS Code parity: Code Lens (references, implementations).
// ============================================================================

import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";

// ============================================================================
// Widget
// ============================================================================

class CodeLensWidget extends WidgetType {
  constructor(
    private label: string,
    private line: number,
  ) {
    super();
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-code-lens";
    el.textContent = this.label;
    el.title = `Line ${this.line}`;
    return el;
  }

  eq(other: CodeLensWidget) {
    return this.label === other.label && this.line === other.line;
  }

  ignoreEvent() {
    return false;
  }
}

// ============================================================================
// Patterns to detect definition lines
// ============================================================================

const defPatterns = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  /^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/,
  /^\s*(?:export\s+)?interface\s+(\w+)/,
  /^\s*(?:export\s+)?type\s+(\w+)\s*=/,
  /^\s*(?:export\s+)?enum\s+(\w+)/,
  /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/,
  /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/,
];

function findDefinitions(doc: string): { name: string; line: number }[] {
  const lines = doc.split("\n");
  const defs: { name: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of defPatterns) {
      const m = pattern.exec(lines[i]);
      if (m) {
        defs.push({ name: m[1], line: i + 1 });
        break;
      }
    }
  }
  return defs;
}

function countReferences(doc: string, name: string): number {
  // Simple word-boundary counting excluding the definition itself
  const regex = new RegExp(`\\b${name}\\b`, "g");
  const matches = doc.match(regex);
  return matches ? Math.max(0, matches.length - 1) : 0;
}

// ============================================================================
// Plugin
// ============================================================================

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc.toString();
  const defs = findDefinitions(doc);

  for (const def of defs) {
    if (def.line > view.state.doc.lines) continue;
    const refs = countReferences(doc, def.name);
    const label = refs === 1 ? "1 reference" : `${refs} references`;
    const lineObj = view.state.doc.line(def.line);
    const deco = Decoration.widget({
      widget: new CodeLensWidget(label, def.line),
      side: -1,
      block: true,
    });
    builder.add(lineObj.from, lineObj.from, deco);
  }

  return builder.finish();
}

const codeLensPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const codeLensTheme = EditorView.baseTheme({
  ".cm-code-lens": {
    display: "inline-block",
    padding: "0 6px",
    fontSize: "11px",
    lineHeight: "18px",
    color: "var(--text-disabled, #666)",
    cursor: "default",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    letterSpacing: "0.02em",
  },
  ".cm-code-lens:hover": {
    color: "var(--accent-blue, #2997ff)",
    textDecoration: "underline",
    cursor: "pointer",
  },
});

/** Returns CodeMirror 6 extensions for Code Lens. */
export function codeLensExtensions() {
  return [codeLensPlugin, codeLensTheme];
}
