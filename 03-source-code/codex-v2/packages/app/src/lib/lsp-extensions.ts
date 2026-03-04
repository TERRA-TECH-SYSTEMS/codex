// ============================================================================
// CodeEX v2 — LSP Extensions for CodeMirror 6
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Bridges LSP client to CodeMirror 6 extensions:
//   - Diagnostics (squiggly underlines, Problems panel)
//   - Autocompletion (IntelliSense)
//   - Hover information (type tooltips)
//   - Go to Definition (F12 / Ctrl+Click)
// ============================================================================

import { EditorView, hoverTooltip, keymap, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { getLspClient, CompletionItemKind, uriToPath, type LspDiagnostic, type LspCompletionItem, type LspCodeAction } from "./lsp-client";

// ============================================================================
// Diagnostics Extension
// ============================================================================

/**
 * Creates a ViewPlugin that receives LSP diagnostics via custom events
 * and pushes them into CodeMirror's lint system.
 */
function lspDiagnosticsPlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private unlisten: (() => void) | null = null;

      constructor(private view: EditorView) {
        // Listen for LSP diagnostics on this file
        const handler = ((e: CustomEvent<{ uri: string; diagnostics: LspDiagnostic[] }>) => {
          const path = uriToPath(e.detail.uri);
          // Normalize paths for comparison
          const normalizedPath = path.replace(/\\/g, "/");
          const normalizedFile = filePath.replace(/\\/g, "/");
          if (normalizedPath !== normalizedFile) return;

          const cmDiags: LintDiagnostic[] = [];
          for (const d of e.detail.diagnostics) {
            const fromLine = d.range.start.line + 1;
            const toLine = d.range.end.line + 1;
            const doc = this.view.state.doc;

            // Clamp to document bounds
            if (fromLine > doc.lines || fromLine < 1) continue;

            const startLineInfo = doc.line(Math.min(fromLine, doc.lines));
            const endLineInfo = doc.line(Math.min(toLine, doc.lines));

            const from = Math.min(startLineInfo.from + d.range.start.character, startLineInfo.to);
            const to = Math.min(endLineInfo.from + d.range.end.character, endLineInfo.to);

            cmDiags.push({
              from: Math.max(0, from),
              to: Math.max(from, to),
              severity: d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info",
              message: d.message,
              source: d.source,
            });
          }

          this.view.dispatch(setDiagnostics(this.view.state, cmDiags));
        }) as EventListener;

        document.addEventListener("codex:lsp-diagnostics", handler);
        this.unlisten = () => document.removeEventListener("codex:lsp-diagnostics", handler);
      }

      update(_update: ViewUpdate) {
        // No-op — diagnostics are pushed via events
      }

      destroy() {
        this.unlisten?.();
      }
    }
  );
}

// ============================================================================
// Autocompletion Extension
// ============================================================================

/** LSP-powered autocompletion source for CodeMirror. */
function lspCompletionSource(filePath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const client = getLspClient();
    if (client.getStatus() !== "ready") return null;

    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const lineNumber = line.number - 1; // LSP is 0-indexed
    const character = pos - line.from;

    // Only trigger on explicit or after typing a trigger character
    if (!context.explicit && !context.matchBefore(/[\w.]/)) return null;

    try {
      const items = await client.completion(filePath, lineNumber, character);
      if (!items || items.length === 0) return null;

      const completions: Completion[] = items.map((item: LspCompletionItem) => {
        const insertText = item.textEdit?.newText ?? item.insertText ?? item.label;
        const kind = item.kind ? CompletionItemKind[item.kind] ?? "text" : "text";

        // Map LSP kinds to CM6 completion types
        let type: string;
        switch (kind) {
          case "function": case "method": case "constructor": type = "function"; break;
          case "variable": case "field": case "property": type = "variable"; break;
          case "class": case "struct": type = "class"; break;
          case "interface": type = "interface"; break;
          case "module": type = "namespace"; break;
          case "keyword": type = "keyword"; break;
          case "enum": case "enumMember": type = "enum"; break;
          case "constant": type = "constant"; break;
          case "snippet": type = "text"; break;
          default: type = "text";
        }

        let detail = item.detail ?? "";
        let info: string | undefined;
        if (item.documentation) {
          if (typeof item.documentation === "string") {
            info = item.documentation;
          } else if (item.documentation.value) {
            info = item.documentation.value;
          }
        }

        return {
          label: item.label,
          detail,
          info,
          type,
          apply: insertText,
          boost: kind === "keyword" ? -2 : kind === "snippet" ? -1 : 0,
        };
      });

      // Determine the start of the word being completed
      const word = context.matchBefore(/[\w$]*/);
      const from = word ? word.from : pos;

      return {
        from,
        options: completions,
        validFor: /^[\w$]*$/,
      };
    } catch {
      return null;
    }
  };
}

// ============================================================================
// Hover Extension
// ============================================================================

/** LSP-powered hover tooltips showing type information. */
function lspHoverTooltip(filePath: string): Extension {
  return hoverTooltip(async (view, pos) => {
    const client = getLspClient();
    if (client.getStatus() !== "ready") return null;

    const line = view.state.doc.lineAt(pos);
    const lineNumber = line.number - 1;
    const character = pos - line.from;

    const hover = await client.hover(filePath, lineNumber, character);
    if (!hover) return null;

    // Extract hover content
    let content = "";
    if (typeof hover.contents === "string") {
      content = hover.contents;
    } else if (Array.isArray(hover.contents)) {
      content = hover.contents
        .map((c) => (typeof c === "string" ? c : c.value))
        .join("\n\n");
    } else if (hover.contents && typeof hover.contents === "object") {
      content = hover.contents.value ?? "";
    }

    if (!content.trim()) return null;

    // Determine tooltip position from hover range or token
    const from = hover.range
      ? line.from + (hover.range.start.line === lineNumber ? hover.range.start.character : 0)
      : pos;

    return {
      pos: from,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-lsp-hover";

        // Parse markdown code blocks for syntax highlighting
        const parts = content.split(/```(\w*)\n?/);
        for (let i = 0; i < parts.length; i++) {
          if (i % 2 === 0) {
            // Regular text
            const text = parts[i].trim();
            if (text) {
              const span = document.createElement("span");
              span.className = "cm-lsp-hover-text";
              span.textContent = text;
              dom.appendChild(span);
            }
          } else {
            // Code block — next part is the code content
            const code = parts[i + 1]?.trim() ?? "";
            if (code) {
              const pre = document.createElement("pre");
              pre.className = "cm-lsp-hover-code";
              const codeEl = document.createElement("code");
              codeEl.textContent = code;
              pre.appendChild(codeEl);
              dom.appendChild(pre);
            }
            i++; // Skip the code content (already consumed)
          }
        }

        // If no code blocks were found, render as plain code
        if (dom.children.length === 0) {
          const pre = document.createElement("pre");
          pre.className = "cm-lsp-hover-code";
          const codeEl = document.createElement("code");
          codeEl.textContent = content;
          pre.appendChild(codeEl);
          dom.appendChild(pre);
        }

        return { dom };
      },
    };
  }, { hoverTime: 300 });
}

// ============================================================================
// Go to Definition Extension
// ============================================================================

/** F12 / Ctrl+Click — navigate to definition. */
function lspGoToDefinition(filePath: string): Extension {
  return keymap.of([
    {
      key: "F12",
      run: (view) => {
        goToDefinition(view, filePath);
        return true;
      },
    },
  ]);
}

async function goToDefinition(view: EditorView, filePath: string) {
  const client = getLspClient();
  if (client.getStatus() !== "ready") return;

  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const lineNumber = line.number - 1;
  const character = pos - line.from;

  const locations = await client.definition(filePath, lineNumber, character);
  if (!locations || locations.length === 0) return;

  const loc = locations[0];
  const targetPath = uriToPath(loc.uri);
  const targetLine = loc.range.start.line + 1;

  // Dispatch navigation event — App.tsx handles opening the file and jumping to line
  document.dispatchEvent(new CustomEvent("codex:goto-definition", {
    detail: { path: targetPath, line: targetLine, character: loc.range.start.character },
  }));
}

// ============================================================================
// LSP Hover Theme (Apple Aesthetic)
// ============================================================================

const lspHoverTheme = EditorView.theme({
  ".cm-lsp-hover": {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px 12px",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize: "12px",
    lineHeight: "1.5",
    maxWidth: "500px",
    maxHeight: "300px",
    overflow: "auto",
  },
  ".cm-lsp-hover-text": {
    color: "#a1a1a6",
    fontSize: "11px",
    lineHeight: "1.4",
  },
  ".cm-lsp-hover-code": {
    margin: "0",
    padding: "4px 8px",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: "4px",
    color: "#f5f5f7",
    fontSize: "12px",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflow: "auto",
  },
  ".cm-lsp-hover-code code": {
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  },
  // Override the default tooltip styling for LSP hovers
  ".cm-tooltip:has(.cm-lsp-hover)": {
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    backgroundColor: "#1a1a1a",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
  },
}, { dark: true });

// ============================================================================
// Document Change Notifier
// ============================================================================

/** ViewPlugin that sends didChange notifications to the LSP server on edits. */
function lspDocumentSync(filePath: string): Extension {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {}

      update(update: ViewUpdate) {
        if (!update.docChanged) return;

        // Debounce changes — send after 300ms of no typing
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const client = getLspClient();
          if (client.getStatus() === "ready") {
            client.didChange(filePath, this.view.state.doc.toString());
          }
        }, 300);
      }

      destroy() {
        if (debounceTimer) clearTimeout(debounceTimer);
      }
    }
  );
}

// ============================================================================
// Code Actions Extension (Lightbulb / Quick Fix)
// ============================================================================

/** ViewPlugin that shows a lightbulb indicator when code actions are available. */
function lspCodeActions(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private actionMenu: HTMLDivElement | null = null;
      private lightbulb: HTMLDivElement | null = null;
      private debounceTimer: ReturnType<typeof setTimeout> | null = null;

      constructor(private view: EditorView) {
        // Listen for Ctrl+. to trigger code actions
        this.view.dom.addEventListener("keydown", this.handleKeyDown);
      }

      private handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === ".") {
          e.preventDefault();
          this.showCodeActions();
        }
      };

      update(update: ViewUpdate) {
        if (!update.selectionSet) return;
        // Debounce code action queries
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.checkForActions(), 500);
      }

      private async checkForActions() {
        this.removeLightbulb();
        const client = getLspClient();
        if (client.getStatus() !== "ready") return;

        const pos = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(pos);
        const lineNumber = line.number - 1;
        const character = pos - line.from;

        const actions = await client.codeAction(filePath, lineNumber, character, lineNumber, character);
        if (actions.length > 0) {
          this.showLightbulb(line.number);
        }
      }

      private showLightbulb(lineNumber: number) {
        this.removeLightbulb();
        const lineInfo = this.view.state.doc.line(lineNumber);
        const coords = this.view.coordsAtPos(lineInfo.from);
        if (!coords) return;

        this.lightbulb = document.createElement("div");
        this.lightbulb.className = "cm-lsp-lightbulb";
        this.lightbulb.textContent = "\uD83D\uDCA1";
        this.lightbulb.style.top = `${coords.top}px`;
        this.lightbulb.style.left = `${coords.left - 24}px`;
        this.lightbulb.onclick = () => this.showCodeActions();
        this.view.dom.appendChild(this.lightbulb);
      }

      private removeLightbulb() {
        this.lightbulb?.remove();
        this.lightbulb = null;
      }

      private async showCodeActions() {
        this.removeMenu();
        const client = getLspClient();
        if (client.getStatus() !== "ready") return;

        const pos = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(pos);
        const lineNumber = line.number - 1;
        const character = pos - line.from;

        const actions = await client.codeAction(filePath, lineNumber, character, lineNumber, character);
        if (actions.length === 0) return;

        const coords = this.view.coordsAtPos(pos);
        if (!coords) return;

        this.actionMenu = document.createElement("div");
        this.actionMenu.className = "cm-lsp-action-menu";
        this.actionMenu.style.top = `${coords.bottom + 4}px`;
        this.actionMenu.style.left = `${coords.left}px`;

        for (const action of actions) {
          const item = document.createElement("div");
          item.className = "cm-lsp-action-item";
          const icon = action.kind?.startsWith("quickfix") ? "\u2692" : action.kind?.startsWith("refactor") ? "\u2699" : "\u26A1";
          item.textContent = `${icon} ${action.title}`;
          if (action.isPreferred) item.classList.add("preferred");
          item.onclick = () => {
            this.applyCodeAction(action);
            this.removeMenu();
          };
          this.actionMenu.appendChild(item);
        }

        this.view.dom.appendChild(this.actionMenu);

        // Close on click outside
        const closeHandler = (e: MouseEvent) => {
          if (!this.actionMenu?.contains(e.target as Node)) {
            this.removeMenu();
            document.removeEventListener("click", closeHandler);
          }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
      }

      private async applyCodeAction(action: LspCodeAction) {
        if (action.edit?.changes) {
          // Apply workspace edit
          for (const [uri, edits] of Object.entries(action.edit.changes)) {
            const path = uriToPath(uri);
            const normalizedPath = path.replace(/\\/g, "/");
            const normalizedFile = filePath.replace(/\\/g, "/");
            if (normalizedPath === normalizedFile) {
              // Apply edits to current editor (in reverse order to preserve positions)
              const sortedEdits = [...edits].sort((a, b) => {
                const aStart = a.range.start.line * 10000 + a.range.start.character;
                const bStart = b.range.start.line * 10000 + b.range.start.character;
                return bStart - aStart;
              });
              for (const edit of sortedEdits) {
                const fromLine = this.view.state.doc.line(Math.min(edit.range.start.line + 1, this.view.state.doc.lines));
                const toLine = this.view.state.doc.line(Math.min(edit.range.end.line + 1, this.view.state.doc.lines));
                const from = fromLine.from + edit.range.start.character;
                const to = toLine.from + edit.range.end.character;
                this.view.dispatch({ changes: { from, to, insert: edit.newText } });
              }
            }
          }
        }
      }

      private removeMenu() {
        this.actionMenu?.remove();
        this.actionMenu = null;
      }

      destroy() {
        this.removeLightbulb();
        this.removeMenu();
        this.view.dom.removeEventListener("keydown", this.handleKeyDown);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
      }
    }
  );
}

// ============================================================================
// Rename Symbol Extension (F2)
// ============================================================================

/** F2 — Rename Symbol with inline input. */
function lspRenameSymbol(filePath: string): Extension {
  return keymap.of([
    {
      key: "F2",
      run: (view) => {
        requestRename(view, filePath);
        return true;
      },
    },
  ]);
}

async function requestRename(view: EditorView, filePath: string) {
  const client = getLspClient();
  if (client.getStatus() !== "ready") return;

  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const lineNumber = line.number - 1;
  const character = pos - line.from;

  // Check if rename is available at this position
  const prepareResult = await client.prepareRename(filePath, lineNumber, character);
  if (!prepareResult) return;

  // Get the current word at position
  const word = view.state.wordAt(pos);
  if (!word) return;
  const currentName = view.state.sliceDoc(word.from, word.to);

  // Show inline rename input
  const coords = view.coordsAtPos(pos);
  if (!coords) return;

  const overlay = document.createElement("div");
  overlay.className = "cm-lsp-rename-overlay";

  const input = document.createElement("input");
  input.className = "cm-lsp-rename-input";
  input.value = currentName;
  input.style.top = `${coords.top - 2}px`;
  input.style.left = `${coords.left}px`;
  input.select();

  const cleanup = () => {
    input.remove();
    overlay.remove();
  };

  input.onkeydown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        const edit = await client.rename(filePath, lineNumber, character, newName);
        if (edit?.changes) {
          for (const [uri, edits] of Object.entries(edit.changes as Record<string, any[]>)) {
            const path = uriToPath(uri);
            const normalizedPath = path.replace(/\\/g, "/");
            const normalizedFile = filePath.replace(/\\/g, "/");
            if (normalizedPath === normalizedFile) {
              const sortedEdits = [...edits].sort((a, b) => {
                const aStart = a.range.start.line * 10000 + a.range.start.character;
                const bStart = b.range.start.line * 10000 + b.range.start.character;
                return bStart - aStart;
              });
              for (const edit of sortedEdits) {
                const fromLine = view.state.doc.line(Math.min(edit.range.start.line + 1, view.state.doc.lines));
                const toLine = view.state.doc.line(Math.min(edit.range.end.line + 1, view.state.doc.lines));
                const from = fromLine.from + edit.range.start.character;
                const to = toLine.from + edit.range.end.character;
                view.dispatch({ changes: { from, to, insert: edit.newText } });
              }
            } else {
              // For other files, dispatch an event for App.tsx to handle
              document.dispatchEvent(new CustomEvent("codex:apply-edits", {
                detail: { path, edits },
              }));
            }
          }
        }
      }
      cleanup();
    } else if (e.key === "Escape") {
      cleanup();
    }
  };

  overlay.onclick = cleanup;
  view.dom.appendChild(overlay);
  view.dom.appendChild(input);
  input.focus();
}

// ============================================================================
// References Extension (Shift+F12)
// ============================================================================

/** Shift+F12 — Find All References. */
function lspReferences(filePath: string): Extension {
  return keymap.of([
    {
      key: "Shift-F12",
      run: (view) => {
        findReferences(view, filePath);
        return true;
      },
    },
  ]);
}

async function findReferences(view: EditorView, filePath: string) {
  const client = getLspClient();
  if (client.getStatus() !== "ready") return;

  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const lineNumber = line.number - 1;
  const character = pos - line.from;

  const locations = await client.references(filePath, lineNumber, character);
  if (!locations || locations.length === 0) return;

  // Dispatch references to a panel/UI
  document.dispatchEvent(new CustomEvent("codex:show-references", {
    detail: {
      references: locations.map((loc) => ({
        path: uriToPath(loc.uri),
        line: loc.range.start.line + 1,
        character: loc.range.start.character,
        endLine: loc.range.end.line + 1,
        endCharacter: loc.range.end.character,
      })),
    },
  }));
}

// ============================================================================
// Signature Help Extension
// ============================================================================

/** Signature help popup triggered on ( and , characters. */
function lspSignatureHelp(filePath: string): Extension {
  let activeTooltip: HTMLDivElement | null = null;

  return ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {}

      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        // Check if the last typed character was ( or ,
        update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
          const text = inserted.toString();
          if (text === "(" || text === ",") {
            this.showSignatureHelp();
          } else if (text === ")") {
            this.hideTooltip();
          }
        });
      }

      private async showSignatureHelp() {
        const client = getLspClient();
        if (client.getStatus() !== "ready") return;

        const pos = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(pos);
        const lineNumber = line.number - 1;
        const character = pos - line.from;

        const help = await client.signatureHelp(filePath, lineNumber, character);
        if (!help || help.signatures.length === 0) { this.hideTooltip(); return; }

        const sig = help.signatures[help.activeSignature ?? 0];
        if (!sig) { this.hideTooltip(); return; }

        this.hideTooltip();

        const coords = this.view.coordsAtPos(pos);
        if (!coords) return;

        activeTooltip = document.createElement("div");
        activeTooltip.className = "cm-lsp-signature";
        activeTooltip.style.top = `${coords.top - 4}px`;
        activeTooltip.style.left = `${coords.left}px`;
        activeTooltip.style.transform = "translateY(-100%)";

        const label = document.createElement("code");
        label.className = "cm-lsp-signature-label";

        // Highlight active parameter
        if (sig.parameters && help.activeParameter !== undefined && help.activeParameter < sig.parameters.length) {
          const param = sig.parameters[help.activeParameter];
          if (typeof param.label === "string") {
            const idx = sig.label.indexOf(param.label);
            if (idx >= 0) {
              label.appendChild(document.createTextNode(sig.label.slice(0, idx)));
              const highlight = document.createElement("b");
              highlight.className = "cm-lsp-signature-active-param";
              highlight.textContent = param.label;
              label.appendChild(highlight);
              label.appendChild(document.createTextNode(sig.label.slice(idx + param.label.length)));
            } else {
              label.textContent = sig.label;
            }
          } else {
            const [start, end] = param.label;
            label.appendChild(document.createTextNode(sig.label.slice(0, start)));
            const highlight = document.createElement("b");
            highlight.className = "cm-lsp-signature-active-param";
            highlight.textContent = sig.label.slice(start, end);
            label.appendChild(highlight);
            label.appendChild(document.createTextNode(sig.label.slice(end)));
          }
        } else {
          label.textContent = sig.label;
        }

        activeTooltip.appendChild(label);
        this.view.dom.appendChild(activeTooltip);
      }

      private hideTooltip() {
        activeTooltip?.remove();
        activeTooltip = null;
      }

      destroy() {
        this.hideTooltip();
      }
    }
  );
}

// ============================================================================
// Code Actions / Rename / References / Signature Help Theme
// ============================================================================

const lspActionsTheme = EditorView.theme({
  ".cm-lsp-lightbulb": {
    position: "absolute",
    fontSize: "14px",
    cursor: "pointer",
    zIndex: "10",
    opacity: "0.8",
    transition: "opacity 0.15s",
    lineHeight: "1",
    userSelect: "none",
    "&:hover": { opacity: "1" },
  },
  ".cm-lsp-action-menu": {
    position: "absolute",
    zIndex: "100",
    minWidth: "200px",
    maxWidth: "400px",
    background: "#1a1a1a",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
    padding: "4px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
  },
  ".cm-lsp-action-item": {
    padding: "6px 10px",
    cursor: "pointer",
    borderRadius: "4px",
    color: "#f5f5f7",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    "&:hover": { background: "rgba(41, 151, 255, 0.15)" },
    "&.preferred": { color: "#2997ff" },
  },
  ".cm-lsp-rename-overlay": {
    position: "fixed",
    inset: "0",
    zIndex: "99",
  },
  ".cm-lsp-rename-input": {
    position: "absolute",
    zIndex: "100",
    background: "#1a1a1a",
    border: "2px solid #2997ff",
    borderRadius: "4px",
    color: "#f5f5f7",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    padding: "2px 6px",
    outline: "none",
    minWidth: "120px",
  },
  ".cm-lsp-signature": {
    position: "absolute",
    zIndex: "50",
    background: "#1a1a1a",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
    padding: "6px 10px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    color: "#a1a1a6",
    maxWidth: "500px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-lsp-signature-label": {
    color: "#f5f5f7",
  },
  ".cm-lsp-signature-active-param": {
    color: "#2997ff",
    fontWeight: "700",
  },
}, { dark: true });

// ============================================================================
// Combined LSP Extension Bundle
// ============================================================================

/**
 * Creates the full LSP extension bundle for a file.
 * Only enables features when the LSP client is running.
 */
export function lspExtensions(filePath: string): Extension[] {
  const client = getLspClient();
  if (!client.supportsLanguage(filePath)) return [];

  return [
    lspDiagnosticsPlugin(filePath),
    lspDocumentSync(filePath),
    lspHoverTooltip(filePath),
    lspGoToDefinition(filePath),
    lspCodeActions(filePath),
    lspRenameSymbol(filePath),
    lspReferences(filePath),
    lspSignatureHelp(filePath),
    lspHoverTheme,
    lspActionsTheme,
    // LSP completion is added via autocompletion override in EditorArea
  ];
}

/**
 * Returns an LSP-powered completion source for use with CM6 autocompletion.
 * Should be combined with snippet completions in the autocompletion override.
 */
export function lspCompletionExtension(filePath: string) {
  return lspCompletionSource(filePath);
}
