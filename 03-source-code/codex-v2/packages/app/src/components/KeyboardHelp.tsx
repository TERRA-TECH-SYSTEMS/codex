// ============================================================================
// CodeEX v2 — Keyboard Shortcut Help Overlay
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Modal overlay displaying all available keyboard shortcuts.
// Toggle: Ctrl+? (Ctrl+Shift+/)
// ============================================================================

import { For } from "solid-js";

interface Props {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: "Ctrl+P", description: "Quick Open" },
      { keys: "Ctrl+Shift+P", description: "Command Palette" },
      { keys: "Ctrl+,", description: "Settings" },
      { keys: "Ctrl+Shift+/", description: "Keyboard Shortcuts" },
      { keys: "Ctrl+N", description: "New File" },
      { keys: "Ctrl+S", description: "Save File" },
      { keys: "Ctrl+G", description: "Go to Line" },
      { keys: "Ctrl+Shift+O", description: "Go to Symbol" },
      { keys: "F12", description: "Go to Definition (LSP)" },
      { keys: "F2", description: "Rename Symbol (LSP)" },
      { keys: "Shift+F12", description: "Find All References (LSP)" },
      { keys: "Ctrl+.", description: "Quick Fix / Code Action (LSP)" },
      { keys: "Ctrl+Shift+F", description: "Search in Files" },
      { keys: "Ctrl+Shift+H", description: "Replace in Files" },
      { keys: "Escape", description: "Close Overlay" },
    ],
  },
  {
    title: "Panels & View",
    shortcuts: [
      { keys: "Ctrl+B", description: "Toggle Sidebar" },
      { keys: "Ctrl+Shift+E", description: "Focus File Explorer" },
      { keys: "Ctrl+Shift+G", description: "Focus Source Control" },
      { keys: "Ctrl+`", description: "Toggle Terminal" },
      { keys: "Ctrl+J", description: "Toggle Panel" },
      { keys: "Ctrl+Shift+M", description: "Toggle Problems" },
      { keys: "Ctrl+Shift+U", description: "Toggle Output" },
      { keys: "Ctrl+Escape", description: "Focus Gixsis Chat" },
      { keys: "Ctrl+M", description: "Toggle Voice Input (STT)" },
      { keys: "Ctrl+=", description: "Zoom In" },
      { keys: "Ctrl+-", description: "Zoom Out" },
      { keys: "Ctrl+0", description: "Reset Zoom" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: "Ctrl+Z", description: "Undo" },
      { keys: "Ctrl+Shift+Z", description: "Redo" },
      { keys: "Ctrl+D", description: "Select Next Occurrence" },
      { keys: "Ctrl+/", description: "Toggle Comment" },
      { keys: "Alt+Up/Down", description: "Move Line Up/Down" },
      { keys: "Shift+Alt+Up/Down", description: "Duplicate Line Up/Down" },
      { keys: "Ctrl+F", description: "Find in File" },
      { keys: "Ctrl+H", description: "Find & Replace" },
      { keys: "Tab", description: "Indent" },
      { keys: "Shift+Tab", description: "Outdent" },
      { keys: "Shift+Alt+F", description: "Format Document" },
    ],
  },
  {
    title: "Debug",
    shortcuts: [
      { keys: "F5", description: "Start / Continue Debugging" },
      { keys: "Shift+F5", description: "Stop Debugging" },
      { keys: "F9", description: "Toggle Breakpoint" },
      { keys: "F10", description: "Step Over" },
      { keys: "F11", description: "Step Into" },
      { keys: "Shift+F11", description: "Step Out" },
      { keys: "Ctrl+Shift+D", description: "Toggle Debug Panel" },
    ],
  },
  {
    title: "Tabs",
    shortcuts: [
      { keys: "Ctrl+W", description: "Close Tab" },
      { keys: "Middle Click", description: "Close Tab" },
      { keys: "Ctrl+Shift+T", description: "Reopen Closed Tab" },
      { keys: "Ctrl+Shift+C", description: "Copy File Path" },
      { keys: "Ctrl+Tab", description: "Next Tab" },
      { keys: "Ctrl+Shift+Tab", description: "Previous Tab" },
    ],
  },
];

export function KeyboardHelp(props: Props) {
  return (
    <div class="kbd-overlay" onClick={props.onClose}>
      <div class="kbd-panel" onClick={(e) => e.stopPropagation()}>
        <div class="kbd-header">
          <span class="kbd-title">Keyboard Shortcuts</span>
          <button class="kbd-close" onClick={props.onClose}>&times;</button>
        </div>

        <div class="kbd-body">
          <For each={shortcutGroups}>
            {(group) => (
              <div class="kbd-group">
                <div class="kbd-group-title">{group.title}</div>
                <For each={group.shortcuts}>
                  {(shortcut) => (
                    <div class="kbd-row">
                      <span class="kbd-desc">{shortcut.description}</span>
                      <span class="kbd-keys">
                        <For each={shortcut.keys.split("+")}>
                          {(key, i) => (
                            <>
                              <kbd class="kbd-key">{key}</kbd>
                              {i() < shortcut.keys.split("+").length - 1 && <span class="kbd-plus">+</span>}
                            </>
                          )}
                        </For>
                      </span>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>

      <style>{`
        .kbd-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
        }
        .kbd-panel {
          width: 520px;
          max-height: 80vh;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-elevated);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .kbd-header {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .kbd-title {
          font-size: var(--text-md);
          font-weight: 600;
          color: var(--text-primary);
        }
        .kbd-close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 18px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .kbd-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .kbd-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .kbd-group-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: var(--space-2);
        }
        .kbd-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 32px;
          padding: 0 var(--space-2);
          border-radius: var(--radius-sm);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .kbd-row:hover {
          background: var(--bg-hover);
        }
        .kbd-desc {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }
        .kbd-keys {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .kbd-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 22px;
          padding: 0 6px;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-primary);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .kbd-plus {
          font-size: var(--text-xs);
          color: var(--text-disabled);
        }
      `}</style>
    </div>
  );
}
