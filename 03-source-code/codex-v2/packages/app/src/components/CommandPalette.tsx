// ============================================================================
// CodeEX v2 — Command Palette (Ctrl+Shift+P)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, For, onMount } from "solid-js";
import type { CommandAction } from "~/lib/types";

interface Props {
  onClose: () => void;
}

const commands: CommandAction[] = [
  { id: "file.new", label: "New File", shortcut: "Ctrl+N", category: "File", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true })) },
  { id: "file.quickOpen", label: "Quick Open", shortcut: "Ctrl+P", category: "File", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true })) },
  { id: "file.open", label: "Open File", shortcut: "Ctrl+O", category: "File", action: () => {} },
  { id: "file.save", label: "Save File", shortcut: "Ctrl+S", category: "File", action: () => {} },
  { id: "view.sidebar", label: "Toggle Sidebar", shortcut: "Ctrl+B", category: "View", action: () => document.dispatchEvent(new CustomEvent("codex:toggle-sidebar")) },
  { id: "view.chat", label: "Toggle Gixsis Chat", shortcut: "Ctrl+Escape", category: "View", action: () => document.dispatchEvent(new CustomEvent("codex:toggle-chat")) },
  { id: "view.terminal", label: "Toggle Terminal", shortcut: "Ctrl+`", category: "View", action: () => document.dispatchEvent(new CustomEvent("codex:toggle-terminal")) },
  { id: "gixsis.chat", label: "Ask Gixsis", category: "Gixsis", action: () => {} },
  { id: "gixsis.explain", label: "Explain Selection", category: "Gixsis", action: () => {} },
  { id: "gixsis.refactor", label: "Refactor Selection", category: "Gixsis", action: () => {} },
  { id: "gixsis.plan", label: "Plan Mode", category: "Gixsis", action: () => {} },
  { id: "editor.toggleComment", label: "Toggle Line Comment", shortcut: "Ctrl+/", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:toggle-comment")) },
  { id: "editor.moveLineUp", label: "Move Line Up", shortcut: "Alt+Up", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:move-line-up")) },
  { id: "editor.moveLineDown", label: "Move Line Down", shortcut: "Alt+Down", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:move-line-down")) },
  { id: "editor.copyLineUp", label: "Duplicate Line Up", shortcut: "Shift+Alt+Up", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:copy-line-up")) },
  { id: "editor.copyLineDown", label: "Duplicate Line Down", shortcut: "Shift+Alt+Down", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:copy-line-down")) },
  { id: "editor.selectNext", label: "Select Next Occurrence", shortcut: "Ctrl+D", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:select-next")) },
  { id: "editor.format", label: "Format Document", shortcut: "Shift+Alt+F", category: "Editor", action: () => document.dispatchEvent(new CustomEvent("codex:format-document")) },
  { id: "editor.find", label: "Find", shortcut: "Ctrl+F", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true })) },
  { id: "editor.replace", label: "Find and Replace", shortcut: "Ctrl+H", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "h", ctrlKey: true })) },
  { id: "editor.goto", label: "Go to Line", shortcut: "Ctrl+G", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "g", ctrlKey: true })) },
  { id: "editor.gotoSymbol", label: "Go to Symbol", shortcut: "Ctrl+Shift+O", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "O", ctrlKey: true, shiftKey: true })) },
  { id: "editor.copyPath", label: "Copy File Path", shortcut: "Ctrl+Shift+C", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "C", ctrlKey: true, shiftKey: true })) },
  { id: "search.searchInFiles", label: "Search in Files", shortcut: "Ctrl+Shift+F", category: "Search", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true })) },
  { id: "search.replaceInFiles", label: "Replace in Files", shortcut: "Ctrl+Shift+H", category: "Search", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "H", ctrlKey: true, shiftKey: true })) },
  { id: "view.focusExplorer", label: "Focus File Explorer", shortcut: "Ctrl+Shift+E", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "E", ctrlKey: true, shiftKey: true })) },
  { id: "view.focusSourceControl", label: "Focus Source Control", shortcut: "Ctrl+Shift+G", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "G", ctrlKey: true, shiftKey: true })) },
  { id: "view.togglePanel", label: "Toggle Panel", shortcut: "Ctrl+J", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true })) },
  { id: "view.toggleProblems", label: "Toggle Problems", shortcut: "Ctrl+Shift+M", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "M", ctrlKey: true, shiftKey: true })) },
  { id: "view.toggleOutput", label: "Toggle Output", shortcut: "Ctrl+Shift+U", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "U", ctrlKey: true, shiftKey: true })) },
  { id: "view.zoomin", label: "Zoom In", shortcut: "Ctrl+=", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "=", ctrlKey: true })) },
  { id: "view.zoomout", label: "Zoom Out", shortcut: "Ctrl+-", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", ctrlKey: true })) },
  { id: "view.zoomreset", label: "Reset Zoom", shortcut: "Ctrl+0", category: "View", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "0", ctrlKey: true })) },
  { id: "editor.gotoDefinition", label: "Go to Definition", shortcut: "F12", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F12" })) },
  { id: "editor.renameSymbol", label: "Rename Symbol", shortcut: "F2", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F2" })) },
  { id: "editor.findReferences", label: "Find All References", shortcut: "Shift+F12", category: "Editor", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F12", shiftKey: true })) },
  { id: "editor.codeAction", label: "Quick Fix / Code Action", shortcut: "Ctrl+.", category: "Editor", action: () => {} },
  { id: "debug.start", label: "Start Debugging", shortcut: "F5", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F5" })) },
  { id: "debug.stop", label: "Stop Debugging", shortcut: "Shift+F5", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", shiftKey: true })) },
  { id: "debug.breakpoint", label: "Toggle Breakpoint", shortcut: "F9", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F9" })) },
  { id: "debug.stepOver", label: "Step Over", shortcut: "F10", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F10" })) },
  { id: "debug.stepInto", label: "Step Into", shortcut: "F11", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F11" })) },
  { id: "debug.stepOut", label: "Step Out", shortcut: "Shift+F11", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F11", shiftKey: true })) },
  { id: "debug.panel", label: "Toggle Debug Panel", shortcut: "Ctrl+Shift+D", category: "Debug", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "D", ctrlKey: true, shiftKey: true })) },
  { id: "git.blame", label: "Toggle Git Blame", category: "Git", action: () => document.dispatchEvent(new CustomEvent("codex:toggle-blame")) },
  { id: "preferences.colorTheme", label: "Color Theme", category: "Preferences", action: () => document.dispatchEvent(new CustomEvent("codex:open-settings", { detail: { category: "appearance" } })) },
  { id: "testing.runAll", label: "Run All Tests", category: "Testing", action: () => document.dispatchEvent(new CustomEvent("codex:run-all-tests")) },
  { id: "testing.discover", label: "Discover Tests", category: "Testing", action: () => document.dispatchEvent(new CustomEvent("codex:discover-tests")) },
  { id: "tasks.build", label: "Run Build Task", shortcut: "Ctrl+Shift+B", category: "Tasks", action: () => document.dispatchEvent(new CustomEvent("codex:run-build-task")) },
  { id: "tasks.discover", label: "Discover Tasks", category: "Tasks", action: () => document.dispatchEvent(new CustomEvent("codex:discover-tasks")) },
  { id: "preferences.snippets", label: "Configure User Snippets", category: "Preferences", action: () => document.dispatchEvent(new CustomEvent("codex:open-settings", { detail: { category: "snippets" } })) },
  { id: "preferences.sync", label: "Settings Sync", category: "Preferences", action: () => document.dispatchEvent(new CustomEvent("codex:open-settings", { detail: { category: "sync" } })) },
  { id: "preferences.syncExport", label: "Export Settings Profile", category: "Preferences", action: () => document.dispatchEvent(new CustomEvent("codex:sync-export")) },
  { id: "preferences.syncImport", label: "Import Settings Profile", category: "Preferences", action: () => document.dispatchEvent(new CustomEvent("codex:sync-import")) },
  { id: "app.settings", label: "Open Settings", shortcut: "Ctrl+,", category: "Preferences", action: () => document.dispatchEvent(new CustomEvent("codex:open-settings")) },
  { id: "app.keyboard", label: "Keyboard Shortcuts", shortcut: "Ctrl+Shift+/", category: "Help", action: () => document.dispatchEvent(new CustomEvent("codex:keyboard-help")) },
  { id: "auth.signout", label: "Sign Out", category: "Account", action: () => window.dispatchEvent(new CustomEvent("codex:sign-out")) },
  { id: "editor.splitEditor", label: "Split Editor Right", shortcut: "Ctrl+\\", category: "View", action: () => document.dispatchEvent(new CustomEvent("codex:split-editor")) },
  { id: "editor.splitEditorDown", label: "Split Editor Down", category: "View", action: () => document.dispatchEvent(new CustomEvent("codex:split-editor", { detail: { direction: "vertical" } })) },
  { id: "search.openSearchEditor", label: "Open Search Editor", category: "Search", action: () => document.dispatchEvent(new CustomEvent("codex:open-search-editor", { detail: { query: "", results: [] } })) },
  { id: "gixsis.stt", label: "Toggle Voice Input (STT)", shortcut: "Ctrl+M", category: "Gixsis", action: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true })) },
  { id: "gixsis.upload", label: "Attach Document to Chat", category: "Gixsis", action: () => document.dispatchEvent(new CustomEvent("codex:upload-file")) },
  { id: "gixsis.transcribe", label: "Transcribe Audio File", category: "Gixsis", action: () => document.dispatchEvent(new CustomEvent("codex:upload-file")) },
  { id: "dev.diff", label: "Show Diff Demo", category: "Dev", action: () => document.dispatchEvent(new CustomEvent("codex:show-diff", { detail: {
    fileName: "src/App.tsx",
    oldContent: "import { createSignal } from \"solid-js\";\n\nexport function App() {\n  const [count, setCount] = createSignal(0);\n\n  return (\n    <div>\n      <h1>Hello World</h1>\n      <button onClick={() => setCount(c => c + 1)}>\n        Count: {count()}\n      </button>\n    </div>\n  );\n}",
    newContent: "import { createSignal, createEffect } from \"solid-js\";\n\nexport function App() {\n  const [count, setCount] = createSignal(0);\n  const [doubled, setDoubled] = createSignal(0);\n\n  createEffect(() => {\n    setDoubled(count() * 2);\n  });\n\n  return (\n    <div>\n      <h1>CodeEX v2</h1>\n      <p>Count: {count()} | Doubled: {doubled()}</p>\n      <button onClick={() => setCount(c => c + 1)}>\n        Increment\n      </button>\n    </div>\n  );\n}",
  }})) },
];

export function CommandPalette(props: Props) {
  const [query, setQuery] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const filtered = () => {
    const q = query().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.category?.toLowerCase().includes(q) ?? false)
    );
  };

  const executeCommand = (cmd: CommandAction) => {
    cmd.action();
    props.onClose();
  };

  onMount(() => {
    inputRef?.focus();
  });

  return (
    <div class="palette-overlay" onClick={props.onClose}>
      <div class="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="palette-input"
          type="text"
          placeholder="> Type a command..."
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") props.onClose();
            if (e.key === "Enter" && filtered().length > 0) {
              executeCommand(filtered()[0]);
            }
          }}
        />
        <div class="palette-results">
          <For each={filtered()}>
            {(cmd) => (
              <div class="palette-item" onClick={() => executeCommand(cmd)}>
                <div class="palette-item-left">
                  <span class="palette-category">{cmd.category}</span>
                  <span class="palette-label">{cmd.label}</span>
                </div>
                {cmd.shortcut && <span class="palette-shortcut">{cmd.shortcut}</span>}
              </div>
            )}
          </For>
        </div>
      </div>

      <style>{`
        .palette-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          justify-content: center;
          padding-top: 80px;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
        }
        .palette {
          width: 560px;
          max-height: 400px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .palette-input {
          width: 100%;
          height: 48px;
          padding: 0 var(--space-4);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-md);
          outline: none;
        }
        .palette-input::placeholder {
          color: var(--text-disabled);
        }
        .palette-results {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-1) 0;
        }
        .palette-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 36px;
          padding: 0 var(--space-4);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .palette-item:hover {
          background: var(--bg-hover);
        }
        .palette-item-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .palette-category {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          min-width: 60px;
        }
        .palette-label {
          font-size: var(--text-sm);
          color: var(--text-primary);
        }
        .palette-shortcut {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          background: var(--bg-base);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }
      `}</style>
    </div>
  );
}
