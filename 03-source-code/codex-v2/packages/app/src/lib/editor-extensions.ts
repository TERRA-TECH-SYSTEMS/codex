// ============================================================================
// CodeEX v2 — Custom Editor Extensions (Minimap + Bracket Colorization)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// ============================================================================
// Bracket Pair Colorization
// ============================================================================

const BRACKET_COLORS = [
  "#ffd700",  // gold
  "#da70d6",  // orchid
  "#2997ff",  // blue (CodeEX accent)
  "#30d158",  // green
  "#ff9f0a",  // orange
  "#ff453a",  // red
];

const OPEN_BRACKETS = new Set(["(", "[", "{"]);
const CLOSE_BRACKETS = new Set([")", "]", "}"]);
const BRACKET_PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

class BracketColorizer {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const { from, to } = view.viewport;
    const doc = view.state.doc;

    // Scan through visible range for brackets, tracking nesting depth
    // We need context from the start to get correct depth, but only decorate viewport
    const text = doc.toString();
    const stack: { char: string; pos: number }[] = [];
    const decorations: { from: number; to: number; depth: number }[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (OPEN_BRACKETS.has(ch)) {
        const depth = stack.length;
        stack.push({ char: ch, pos: i });
        if (i >= from && i < to) {
          decorations.push({ from: i, to: i + 1, depth });
        }
      } else if (CLOSE_BRACKETS.has(ch)) {
        // Pop matching bracket
        if (stack.length > 0) {
          const last = stack[stack.length - 1];
          if (BRACKET_PAIRS[last.char] === ch) {
            stack.pop();
            const depth = stack.length;
            if (i >= from && i < to) {
              decorations.push({ from: i, to: i + 1, depth });
            }
          }
        }
      }
    }

    // Sort and add to builder (must be in document order)
    decorations.sort((a, b) => a.from - b.from);
    for (const d of decorations) {
      const color = BRACKET_COLORS[d.depth % BRACKET_COLORS.length];
      builder.add(d.from, d.to, Decoration.mark({
        attributes: { style: `color: ${color}; font-weight: 600;` },
      }));
    }

    return builder.finish();
  }
}

export const bracketColorization = ViewPlugin.fromClass(BracketColorizer, {
  decorations: (v) => v.decorations,
});

// ============================================================================
// Minimap
// ============================================================================

class MinimapWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-minimap-placeholder";
    return el;
  }
}

/** Minimap rendered as a canvas overlay on the right side of the editor. */
export const minimapPlugin = ViewPlugin.fromClass(
  class {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    container: HTMLElement;
    slider: HTMLElement;
    isDragging = false;
    dragStartY = 0;
    dragStartScroll = 0;
    raf = 0;
    width = 80;
    scale = 1;
    lineHeight = 2;

    constructor(public view: EditorView) {
      // Create minimap container
      this.container = document.createElement("div");
      this.container.className = "cm-minimap";
      this.container.style.cssText = `
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: ${this.width}px;
        background: rgba(0, 0, 0, 0.3);
        overflow: hidden;
        cursor: pointer;
        z-index: 5;
        border-left: 1px solid rgba(255, 255, 255, 0.06);
      `;

      // Create canvas
      this.canvas = document.createElement("canvas");
      this.canvas.style.cssText = "width: 100%; height: 100%; display: block;";
      this.container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d")!;

      // Create viewport slider
      this.slider = document.createElement("div");
      this.slider.className = "cm-minimap-slider";
      this.slider.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        background: rgba(41, 151, 255, 0.08);
        border: 1px solid rgba(41, 151, 255, 0.2);
        border-radius: 2px;
        pointer-events: none;
        transition: top 50ms ease-out;
      `;
      this.container.appendChild(this.slider);

      // Mount
      const scrollDOM = view.scrollDOM;
      scrollDOM.style.position = "relative";
      scrollDOM.style.paddingRight = `${this.width}px`;
      scrollDOM.appendChild(this.container);

      // Events
      this.container.addEventListener("mousedown", this.handleMouseDown);
      document.addEventListener("mousemove", this.handleMouseMove);
      document.addEventListener("mouseup", this.handleMouseUp);

      // Initial render
      this.scheduleRender();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.scheduleRender();
      }
    }

    scheduleRender() {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.render());
    }

    render() {
      const { view, canvas, ctx, width } = this;
      const doc = view.state.doc;
      const totalLines = doc.lines;
      const dpr = window.devicePixelRatio || 1;

      // Size canvas
      const height = this.container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Calculate scale: fit all lines into the canvas height
      this.lineHeight = Math.max(1, Math.min(2, height / totalLines));
      this.scale = this.lineHeight;

      // Render lines as colored bars
      const syntaxColors: Record<string, string> = {
        keyword: "#bf5af2",
        string: "#30d158",
        comment: "#636366",
        number: "#ff9f0a",
        typeName: "#2997ff",
        variableName: "#f5f5f7",
        propertyName: "#64d2ff",
        operator: "#a1a1a6",
        punctuation: "#636366",
      };

      // Fast render: iterate lines, draw colored segments
      for (let i = 1; i <= totalLines; i++) {
        const line = doc.line(i);
        const y = (i - 1) * this.lineHeight;
        if (y > height) break;

        const text = line.text;
        if (text.trim().length === 0) continue;

        // Determine line indent and content width
        const indent = text.length - text.trimStart().length;
        const contentLen = text.trim().length;
        const x = Math.min(indent * 0.5, width * 0.3);
        const w = Math.min(contentLen * 0.5, width - x - 2);

        // Determine color from syntax tree if available
        let color = "rgba(245, 245, 247, 0.25)";
        try {
          const tree = syntaxTree(view.state);
          const node = tree.resolveInner(line.from + indent, 1);
          if (node) {
            const name = node.type.name;
            for (const [key, col] of Object.entries(syntaxColors)) {
              if (name.toLowerCase().includes(key.toLowerCase())) {
                color = col.replace(")", ", 0.5)").replace("rgb", "rgba");
                // Make it semi-transparent
                const match = col.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
                if (match) {
                  color = `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, 0.4)`;
                }
                break;
              }
            }
          }
        } catch {
          // Syntax tree might not be available for all lines
        }

        ctx.fillStyle = color;
        ctx.fillRect(x + 2, y, Math.max(w, 4), Math.max(this.lineHeight - 0.5, 1));
      }

      // Update viewport slider position
      const scrollInfo = view.scrollDOM;
      const scrollTop = scrollInfo.scrollTop;
      const scrollHeight = scrollInfo.scrollHeight;
      const clientHeight = scrollInfo.clientHeight;

      if (scrollHeight > 0) {
        const sliderTop = (scrollTop / scrollHeight) * height;
        const sliderHeight = Math.max((clientHeight / scrollHeight) * height, 20);
        this.slider.style.top = `${sliderTop}px`;
        this.slider.style.height = `${sliderHeight}px`;
      }
    }

    handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = this.container.clientHeight;
      const scrollHeight = this.view.scrollDOM.scrollHeight;
      const clientHeight = this.view.scrollDOM.clientHeight;

      // Click to scroll to that position
      const ratio = y / height;
      const scrollTo = ratio * scrollHeight - clientHeight / 2;
      this.view.scrollDOM.scrollTop = Math.max(0, scrollTo);

      // Start drag
      this.isDragging = true;
      this.dragStartY = e.clientY;
      this.dragStartScroll = this.view.scrollDOM.scrollTop;
    };

    handleMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const deltaY = e.clientY - this.dragStartY;
      const height = this.container.clientHeight;
      const scrollHeight = this.view.scrollDOM.scrollHeight;
      const scrollDelta = (deltaY / height) * scrollHeight;
      this.view.scrollDOM.scrollTop = this.dragStartScroll + scrollDelta;
      this.scheduleRender();
    };

    handleMouseUp = () => {
      this.isDragging = false;
    };

    destroy() {
      cancelAnimationFrame(this.raf);
      document.removeEventListener("mousemove", this.handleMouseMove);
      document.removeEventListener("mouseup", this.handleMouseUp);
      this.container.removeEventListener("mousedown", this.handleMouseDown);
      try {
        this.view.scrollDOM.style.paddingRight = "";
        this.container.remove();
      } catch {}
    }
  }
);

// ============================================================================
// Sticky Scroll (Current Scope Context)
// ============================================================================

/** Shows the current function/class scope at the top of the editor. */
export const stickyScrollPlugin = ViewPlugin.fromClass(
  class {
    stickyEl: HTMLElement;
    lastText = "";

    constructor(public view: EditorView) {
      this.stickyEl = document.createElement("div");
      this.stickyEl.className = "cm-sticky-scroll";
      this.stickyEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 80px;
        background: rgba(10, 10, 10, 0.95);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 13px;
        color: rgba(245, 245, 247, 0.6);
        z-index: 4;
        pointer-events: none;
        display: none;
        padding: 2px 0;
      `;

      const scrollDOM = view.scrollDOM;
      scrollDOM.appendChild(this.stickyEl);

      this.update({ view, docChanged: true, viewportChanged: true } as any);
    }

    update(update: ViewUpdate) {
      if (!update.docChanged && !update.viewportChanged && !update.selectionSet) return;

      const view = this.view ?? update.view;
      const { from } = view.viewport;
      const doc = view.state.doc;

      // Find scope context: walk backwards from the first visible line
      // looking for function/class/method declarations
      const firstVisibleLine = doc.lineAt(from);
      const scopeLines: string[] = [];

      // Common patterns for scope headers
      const scopePatterns = [
        /^\s*(export\s+)?(async\s+)?function\s+\w+/,
        /^\s*(export\s+)?(default\s+)?class\s+\w+/,
        /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
        /^\s*(export\s+)?const\s+\w+\s*=\s*\([^)]*\)\s*=>/,
        /^\s*(export\s+)?(interface|type|enum)\s+\w+/,
        /^\s*(public|private|protected|static|async)\s+\w+\s*\(/,
        /^\s*\w+\s*\([^)]*\)\s*\{/,
      ];

      // Walk backwards from first visible line to find enclosing scopes
      const lineNum = firstVisibleLine.number;
      let braceDepth = 0;

      for (let i = lineNum - 1; i >= 1 && scopeLines.length < 3; i--) {
        const line = doc.line(i);
        const text = line.text;

        // Track brace depth
        for (const ch of text) {
          if (ch === "}") braceDepth++;
          if (ch === "{") braceDepth--;
        }

        // If brace depth is negative, we're inside a scope that started above
        if (braceDepth < 0) {
          for (const pattern of scopePatterns) {
            if (pattern.test(text)) {
              scopeLines.unshift(text);
              braceDepth = 0; // Reset for next scope level
              break;
            }
          }
        }
      }

      const newText = scopeLines.join("\n");
      if (newText === this.lastText) return;
      this.lastText = newText;

      if (scopeLines.length === 0) {
        this.stickyEl.style.display = "none";
        return;
      }

      this.stickyEl.style.display = "block";
      this.stickyEl.innerHTML = scopeLines
        .map((line) => {
          const escaped = line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<div style="padding: 0 16px 0 56px; height: 20px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escaped}</div>`;
        })
        .join("");
    }

    destroy() {
      try {
        this.stickyEl.remove();
      } catch {}
    }
  }
);
