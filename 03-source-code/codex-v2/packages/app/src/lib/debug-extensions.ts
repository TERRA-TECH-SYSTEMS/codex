// ============================================================================
// CodeEX v2 — Debug Extensions for CodeMirror 6
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Breakpoint gutter markers, current-line highlighting for debug mode.
// ============================================================================

import { EditorView, Decoration, WidgetType, gutter, GutterMarker, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSet, StateField, StateEffect, type Extension } from "@codemirror/state";
import { getBreakpointsForFile, toggleBreakpoint, hasBreakpointAt, getDebugState } from "./debug-client";

// ============================================================================
// Breakpoint Gutter Marker
// ============================================================================

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-debug-bp-dot";
    return el;
  }
}

const breakpointMarker = new BreakpointMarker();

// ============================================================================
// State Effect for Breakpoint Updates
// ============================================================================

const setBreakpointsEffect = StateEffect.define<{ lines: number[] }>();

const breakpointState = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setBreakpointsEffect)) {
        const builder: { from: number; to: number; value: GutterMarker }[] = [];
        for (const lineNum of effect.value.lines) {
          if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNum);
            builder.push({ from: line.from, to: line.from, value: breakpointMarker });
          }
        }
        set = RangeSet.of(builder.map((b) => b.value.range(b.from)), true);
      }
    }
    return set;
  },
});

// ============================================================================
// Breakpoint Gutter
// ============================================================================

const breakpointGutter = gutter({
  class: "cm-debug-gutter",
  markers: (view) => view.state.field(breakpointState),
  initialSpacer: () => breakpointMarker,
  domEventHandlers: {
    mousedown(view, line) {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      const filePath = (view.dom as any).__debugFilePath;
      if (filePath) {
        toggleBreakpoint(filePath, lineNumber);
      }
      return true;
    },
  },
});

// ============================================================================
// Sync Plugin — Listens for breakpoint changes
// ============================================================================

function breakpointSyncPlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private unlisten: (() => void) | null = null;

      constructor(private view: EditorView) {
        // Tag the DOM element with the file path for gutter click handler
        (this.view.dom as any).__debugFilePath = filePath;

        // Sync breakpoints on init
        this.syncBreakpoints();

        // Listen for debug state changes
        const handler = () => this.syncBreakpoints();
        document.addEventListener("codex:debug-state-changed", handler);
        this.unlisten = () => document.removeEventListener("codex:debug-state-changed", handler);
      }

      private syncBreakpoints() {
        const bps = getBreakpointsForFile(filePath);
        const lines = bps.filter((bp) => bp.enabled).map((bp) => bp.line);
        this.view.dispatch({ effects: setBreakpointsEffect.of({ lines }) });
      }

      update(_update: ViewUpdate) {
        // No-op — updates come via events
      }

      destroy() {
        this.unlisten?.();
      }
    }
  );
}

// ============================================================================
// Current Debug Line Highlight
// ============================================================================

const debugLineHighlight = StateEffect.define<number | null>();

const debugLineState = StateField.define<number | null>({
  create() { return null; },
  update(val, tr) {
    for (const effect of tr.effects) {
      if (effect.is(debugLineHighlight)) {
        return effect.value;
      }
    }
    return val;
  },
});

const debugLineDecoration = EditorView.decorations.compute([debugLineState], (state) => {
  const lineNum = state.field(debugLineState);
  if (lineNum === null || lineNum < 1 || lineNum > state.doc.lines) {
    return Decoration.none;
  }
  const line = state.doc.line(lineNum);
  return Decoration.set([
    Decoration.line({ class: "cm-debug-current-line" }).range(line.from),
  ]);
});

function debugLinePlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private unlisten: (() => void) | null = null;

      constructor(private view: EditorView) {
        const handler = ((e: CustomEvent<{ file: string; line: number }>) => {
          const normalizedFile = filePath.replace(/\\/g, "/");
          const normalizedEvent = e.detail.file.replace(/\\/g, "/");
          if (normalizedFile === normalizedEvent) {
            this.view.dispatch({ effects: debugLineHighlight.of(e.detail.line) });
          }
        }) as EventListener;
        document.addEventListener("codex:debug-breakpoint-hit", handler);
        this.unlisten = () => document.removeEventListener("codex:debug-breakpoint-hit", handler);
      }

      update(_update: ViewUpdate) {}

      destroy() {
        this.unlisten?.();
      }
    }
  );
}

// ============================================================================
// Inline Debug Values — Show variable values at end of lines
// ============================================================================

class InlineValueWidget extends WidgetType {
  constructor(readonly label: string) { super(); }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-debug-inline-value";
    span.textContent = this.label;
    return span;
  }
  eq(other: InlineValueWidget) { return this.label === other.label; }
  ignoreEvent() { return true; }
}

function inlineValuesPlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations = Decoration.none;
      private unlisten: (() => void) | null = null;

      constructor(private view: EditorView) {
        this.rebuild();
        const handler = () => this.rebuild();
        document.addEventListener("codex:debug-state-changed", handler);
        this.unlisten = () => document.removeEventListener("codex:debug-state-changed", handler);
      }

      rebuild() {
        const state = getDebugState();
        if (state.status !== "paused" || state.variables.length === 0) {
          this.decorations = Decoration.none;
          return;
        }
        // Only show inline values for the file where we're paused
        const normalizedFile = filePath.replace(/\\/g, "/");
        const pausedFile = state.currentFrame?.file?.replace(/\\/g, "/");
        if (!pausedFile || normalizedFile !== pausedFile) {
          this.decorations = Decoration.none;
          return;
        }

        const doc = this.view.state.doc;
        const widgets: { pos: number; widget: InlineValueWidget }[] = [];
        const varMap = new Map<string, string>();
        for (const v of state.variables) {
          varMap.set(v.name, v.value);
        }

        // Scan visible lines for variable name occurrences
        const { from, to } = this.view.viewport;
        for (let pos = from; pos <= to;) {
          const line = doc.lineAt(pos);
          const text = line.text;
          const inlineValues: string[] = [];
          for (const [name, value] of varMap) {
            // Match whole-word variable names in the line
            const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
            if (regex.test(text)) {
              const display = value.length > 50 ? value.slice(0, 47) + "..." : value;
              inlineValues.push(`${name} = ${display}`);
            }
          }
          if (inlineValues.length > 0) {
            widgets.push({
              pos: line.to,
              widget: new InlineValueWidget(inlineValues.join(", ")),
            });
          }
          pos = line.to + 1;
        }

        this.decorations = Decoration.set(
          widgets.map(w => Decoration.widget({ widget: w.widget, side: 1 }).range(w.pos)),
          true
        );
      }

      update(update: ViewUpdate) {
        if (update.viewportChanged) this.rebuild();
      }

      destroy() {
        this.unlisten?.();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// ============================================================================
// Theme
// ============================================================================

const debugTheme = EditorView.theme({
  ".cm-debug-gutter": {
    width: "16px",
    cursor: "pointer",
  },
  ".cm-debug-bp-dot": {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#ff453a",
    margin: "3px 3px",
    boxShadow: "0 0 4px rgba(255, 69, 58, 0.5)",
  },
  ".cm-debug-current-line": {
    backgroundColor: "rgba(255, 159, 10, 0.12) !important",
    borderLeft: "3px solid #ff9f0a",
  },
  ".cm-debug-inline-value": {
    color: "rgba(255, 159, 10, 0.7)",
    fontStyle: "italic",
    fontSize: "0.9em",
    marginLeft: "16px",
    padding: "0 6px",
    borderRadius: "3px",
    backgroundColor: "rgba(255, 159, 10, 0.08)",
    border: "1px solid rgba(255, 159, 10, 0.15)",
    pointerEvents: "none",
    userSelect: "none",
  },
}, { dark: true });

// ============================================================================
// Combined Extension Bundle
// ============================================================================

export function debugExtensions(filePath: string): Extension[] {
  return [
    breakpointState,
    breakpointGutter,
    breakpointSyncPlugin(filePath),
    debugLineState,
    debugLineDecoration,
    debugLinePlugin(filePath),
    inlineValuesPlugin(filePath),
    debugTheme,
  ];
}
