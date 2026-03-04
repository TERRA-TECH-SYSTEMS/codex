// ============================================================================
// CodeEX v2 — Merge Conflict Detection & Resolution
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Detects Git merge conflict markers in editor content and provides
// CodeMirror 6 decorations for visual conflict resolution.
// ============================================================================

import { EditorView, Decoration, WidgetType, ViewPlugin, type ViewUpdate, type DecorationSet } from "@codemirror/view";
import { type Extension, RangeSet } from "@codemirror/state";

// ============================================================================
// Types
// ============================================================================

export interface ConflictRegion {
  /** Line number of <<<<<<< marker (1-based) */
  startLine: number;
  /** Line number of ======= separator (1-based) */
  separatorLine: number;
  /** Line number of >>>>>>> marker (1-based) */
  endLine: number;
  /** Label from <<<<<<< marker (typically branch name) */
  currentLabel: string;
  /** Label from >>>>>>> marker (typically branch name) */
  incomingLabel: string;
}

// ============================================================================
// Conflict Detection
// ============================================================================

export function detectConflicts(content: string): ConflictRegion[] {
  const lines = content.split("\n");
  const conflicts: ConflictRegion[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("<<<<<<<")) {
      const currentLabel = line.substring(7).trim() || "Current Change";
      const startLine = i + 1; // 1-based

      // Find separator
      let sepLine = -1;
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].startsWith("=======")) {
          sepLine = j + 1; // 1-based
          break;
        }
        j++;
      }

      if (sepLine === -1) { i++; continue; }

      // Find end marker
      let endLine = -1;
      let k = j + 1;
      while (k < lines.length) {
        if (lines[k].startsWith(">>>>>>>")) {
          endLine = k + 1; // 1-based
          break;
        }
        k++;
      }

      if (endLine === -1) { i++; continue; }

      const incomingLabel = lines[endLine - 1].substring(7).trim() || "Incoming Change";

      conflicts.push({
        startLine,
        separatorLine: sepLine,
        endLine,
        currentLabel,
        incomingLabel,
      });

      i = k + 1;
    } else {
      i++;
    }
  }

  return conflicts;
}

// ============================================================================
// Conflict Resolution Actions
// ============================================================================

export function acceptCurrent(view: EditorView, conflict: ConflictRegion): void {
  const doc = view.state.doc;
  const startPos = doc.line(conflict.startLine).from;
  const endPos = doc.line(conflict.endLine).to;

  // Extract "current" content (between <<<<<<< and =======)
  const currentLines: string[] = [];
  for (let l = conflict.startLine + 1; l < conflict.separatorLine; l++) {
    currentLines.push(doc.line(l).text);
  }

  view.dispatch({
    changes: { from: startPos, to: endPos, insert: currentLines.join("\n") },
  });
}

export function acceptIncoming(view: EditorView, conflict: ConflictRegion): void {
  const doc = view.state.doc;
  const startPos = doc.line(conflict.startLine).from;
  const endPos = doc.line(conflict.endLine).to;

  // Extract "incoming" content (between ======= and >>>>>>>)
  const incomingLines: string[] = [];
  for (let l = conflict.separatorLine + 1; l < conflict.endLine; l++) {
    incomingLines.push(doc.line(l).text);
  }

  view.dispatch({
    changes: { from: startPos, to: endPos, insert: incomingLines.join("\n") },
  });
}

export function acceptBoth(view: EditorView, conflict: ConflictRegion): void {
  const doc = view.state.doc;
  const startPos = doc.line(conflict.startLine).from;
  const endPos = doc.line(conflict.endLine).to;

  const currentLines: string[] = [];
  for (let l = conflict.startLine + 1; l < conflict.separatorLine; l++) {
    currentLines.push(doc.line(l).text);
  }

  const incomingLines: string[] = [];
  for (let l = conflict.separatorLine + 1; l < conflict.endLine; l++) {
    incomingLines.push(doc.line(l).text);
  }

  view.dispatch({
    changes: { from: startPos, to: endPos, insert: [...currentLines, ...incomingLines].join("\n") },
  });
}

// ============================================================================
// CodeMirror 6 Decorations
// ============================================================================

// Action button widget
class ConflictActionWidget extends WidgetType {
  constructor(
    private conflict: ConflictRegion,
    private view: EditorView,
  ) {
    super();
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-conflict-actions";

    const btnCurrent = document.createElement("button");
    btnCurrent.className = "cm-conflict-btn cm-conflict-accept-current";
    btnCurrent.textContent = "Accept Current";
    btnCurrent.title = `Accept: ${this.conflict.currentLabel}`;
    btnCurrent.onclick = () => acceptCurrent(this.view, this.conflict);

    const btnIncoming = document.createElement("button");
    btnIncoming.className = "cm-conflict-btn cm-conflict-accept-incoming";
    btnIncoming.textContent = "Accept Incoming";
    btnIncoming.title = `Accept: ${this.conflict.incomingLabel}`;
    btnIncoming.onclick = () => acceptIncoming(this.view, this.conflict);

    const btnBoth = document.createElement("button");
    btnBoth.className = "cm-conflict-btn cm-conflict-accept-both";
    btnBoth.textContent = "Accept Both";
    btnBoth.onclick = () => acceptBoth(this.view, this.conflict);

    container.appendChild(btnCurrent);
    container.appendChild(btnIncoming);
    container.appendChild(btnBoth);

    return container;
  }

  ignoreEvent() { return false; }
}

// Build decorations from conflict regions
function buildConflictDecorations(view: EditorView): DecorationSet {
  const content = view.state.doc.toString();
  const conflicts = detectConflicts(content);

  if (conflicts.length === 0) return Decoration.none;

  const decorations: { from: number; to: number; value: Decoration }[] = [];

  for (const conflict of conflicts) {
    try {
      const doc = view.state.doc;
      if (conflict.startLine > doc.lines || conflict.endLine > doc.lines) continue;

      // Action buttons widget above the <<<<<<< line
      const startLineObj = doc.line(conflict.startLine);
      decorations.push({
        from: startLineObj.from,
        to: startLineObj.from,
        value: Decoration.widget({
          widget: new ConflictActionWidget(conflict, view),
          side: -1,
          block: true,
        }),
      });

      // <<<<<<< marker line — green background
      decorations.push({
        from: startLineObj.from,
        to: startLineObj.from,
        value: Decoration.line({ class: "cm-conflict-marker-current" }),
      });

      // Current change lines (green tint)
      for (let l = conflict.startLine + 1; l < conflict.separatorLine; l++) {
        if (l <= doc.lines) {
          const line = doc.line(l);
          decorations.push({
            from: line.from,
            to: line.from,
            value: Decoration.line({ class: "cm-conflict-current" }),
          });
        }
      }

      // ======= separator
      if (conflict.separatorLine <= doc.lines) {
        const sepLine = doc.line(conflict.separatorLine);
        decorations.push({
          from: sepLine.from,
          to: sepLine.from,
          value: Decoration.line({ class: "cm-conflict-separator" }),
        });
      }

      // Incoming change lines (blue tint)
      for (let l = conflict.separatorLine + 1; l < conflict.endLine; l++) {
        if (l <= doc.lines) {
          const line = doc.line(l);
          decorations.push({
            from: line.from,
            to: line.from,
            value: Decoration.line({ class: "cm-conflict-incoming" }),
          });
        }
      }

      // >>>>>>> marker line — blue background
      if (conflict.endLine <= doc.lines) {
        const endLineObj = doc.line(conflict.endLine);
        decorations.push({
          from: endLineObj.from,
          to: endLineObj.from,
          value: Decoration.line({ class: "cm-conflict-marker-incoming" }),
        });
      }
    } catch {
      // Skip invalid conflict regions
    }
  }

  // Sort by position
  decorations.sort((a, b) => a.from - b.from || (a.value.spec.side ?? 0) - (b.value.spec.side ?? 0));

  return RangeSet.of(decorations.map((d) => d.value.range(d.from, d.to)), true);
}

// ViewPlugin that detects and decorates merge conflicts
const conflictPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildConflictDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildConflictDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Theme
const conflictTheme = EditorView.theme({
  ".cm-conflict-actions": {
    display: "flex",
    gap: "8px",
    padding: "4px 8px",
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: "11px",
  },
  ".cm-conflict-btn": {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    fontSize: "11px",
    padding: "2px 6px",
    borderRadius: "3px",
    transition: "all 0.15s ease",
  },
  ".cm-conflict-accept-current": {
    color: "#30d158",
  },
  ".cm-conflict-accept-current:hover": {
    background: "rgba(48, 209, 88, 0.15)",
  },
  ".cm-conflict-accept-incoming": {
    color: "#2997ff",
  },
  ".cm-conflict-accept-incoming:hover": {
    background: "rgba(41, 151, 255, 0.15)",
  },
  ".cm-conflict-accept-both": {
    color: "rgba(255,255,255,0.5)",
  },
  ".cm-conflict-accept-both:hover": {
    color: "rgba(255,255,255,0.8)",
    background: "rgba(255,255,255,0.06)",
  },
  ".cm-conflict-marker-current": {
    backgroundColor: "rgba(48, 209, 88, 0.12) !important",
    borderLeft: "3px solid #30d158",
  },
  ".cm-conflict-current": {
    backgroundColor: "rgba(48, 209, 88, 0.06) !important",
  },
  ".cm-conflict-separator": {
    backgroundColor: "rgba(255,255,255,0.04) !important",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  },
  ".cm-conflict-incoming": {
    backgroundColor: "rgba(41, 151, 255, 0.06) !important",
  },
  ".cm-conflict-marker-incoming": {
    backgroundColor: "rgba(41, 151, 255, 0.12) !important",
    borderLeft: "3px solid #2997ff",
  },
}, { dark: true });

// ============================================================================
// Combined Extension Bundle
// ============================================================================

export function mergeConflictExtensions(): Extension[] {
  return [
    conflictPlugin,
    conflictTheme,
  ];
}

// ============================================================================
// 3-Way Merge Support
// ============================================================================

export interface ThreeWayMergeInput {
  /** File path being merged */
  filePath: string;
  /** Content from the current branch ("ours") */
  current: string;
  /** Content from the incoming branch ("theirs") */
  incoming: string;
  /** Common ancestor content ("base") — optional, synthesized if not available */
  base?: string;
}

export interface MergeConflictBlock {
  /** Index of this conflict block (0-based) */
  index: number;
  /** Lines from "current" (ours) */
  currentLines: string[];
  /** Lines from "incoming" (theirs) */
  incomingLines: string[];
  /** Lines from "base" (ancestor) — empty if base not available */
  baseLines: string[];
  /** Resolution state */
  resolution: "unresolved" | "current" | "incoming" | "both" | "custom";
  /** Custom resolution lines (when resolution === "custom") */
  customLines?: string[];
}

export interface ThreeWayMergeState {
  filePath: string;
  current: string;
  incoming: string;
  base: string;
  conflicts: MergeConflictBlock[];
  /** Non-conflict sections interleaved with conflict blocks — context lines */
  contextSections: string[][];
}

/**
 * Parse a file with merge conflict markers into a 3-way merge state.
 * The file should contain standard <<<<<<< / ======= / >>>>>>> markers.
 */
export function parseThreeWayMerge(input: ThreeWayMergeInput): ThreeWayMergeState {
  const lines = input.current.split("\n");
  const conflicts: MergeConflictBlock[] = [];
  const contextSections: string[][] = [];
  let currentContext: string[] = [];
  let conflictIndex = 0;

  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      // Save accumulated context
      contextSections.push([...currentContext]);
      currentContext = [];

      const currentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("=======")) {
        currentLines.push(lines[i]);
        i++;
      }
      i++; // skip =======

      const incomingLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
        incomingLines.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>>

      conflicts.push({
        index: conflictIndex++,
        currentLines,
        incomingLines,
        baseLines: [],
        resolution: "unresolved",
      });
    } else {
      currentContext.push(lines[i]);
      i++;
    }
  }
  // Final context section
  contextSections.push([...currentContext]);

  return {
    filePath: input.filePath,
    current: input.current,
    incoming: input.incoming,
    base: input.base ?? "",
    conflicts,
    contextSections,
  };
}

/**
 * Resolve a conflict block with the specified strategy.
 */
export function resolveConflict(
  state: ThreeWayMergeState,
  conflictIndex: number,
  resolution: MergeConflictBlock["resolution"],
  customLines?: string[]
): ThreeWayMergeState {
  const conflicts = state.conflicts.map((c, i) => {
    if (i !== conflictIndex) return c;
    return { ...c, resolution, customLines };
  });
  return { ...state, conflicts };
}

/**
 * Build the merged result from the current state of conflict resolutions.
 * Returns null if any conflict is still unresolved.
 */
export function buildMergedResult(state: ThreeWayMergeState): string | null {
  const parts: string[] = [];

  for (let i = 0; i < state.contextSections.length; i++) {
    // Add context lines
    parts.push(...state.contextSections[i]);

    // Add resolved conflict lines (if there's a conflict after this context)
    if (i < state.conflicts.length) {
      const c = state.conflicts[i];
      switch (c.resolution) {
        case "unresolved":
          return null; // Can't build — still unresolved
        case "current":
          parts.push(...c.currentLines);
          break;
        case "incoming":
          parts.push(...c.incomingLines);
          break;
        case "both":
          parts.push(...c.currentLines, ...c.incomingLines);
          break;
        case "custom":
          parts.push(...(c.customLines ?? []));
          break;
      }
    }
  }

  return parts.join("\n");
}

/**
 * Get the count of unresolved conflicts.
 */
export function getUnresolvedCount(state: ThreeWayMergeState): number {
  return state.conflicts.filter(c => c.resolution === "unresolved").length;
}
