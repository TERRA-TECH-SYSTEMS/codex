// ============================================================================
// CodeEX v2 — Welcome Tab
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Displayed when no files are open. Shows branding, shortcuts, and quick actions.
// ============================================================================

import { For, Show } from "solid-js";
import { upgradeToBrowserFS, isFSAccessAvailable, getCurrentBackend } from "~/lib/filesystem";
import { userProfile } from "~/lib/auth-store";

interface Props {
  onOpenFile?: (path: string) => void;
  onFolderOpened?: () => void;
}

const shortcuts = [
  { keys: "Ctrl+Shift+P", label: "Command Palette" },
  { keys: "Ctrl+B", label: "Toggle Sidebar" },
  { keys: "Ctrl+`", label: "Toggle Terminal" },
  { keys: "Ctrl+Escape", label: "Focus Gixsis Chat" },
  { keys: "Ctrl+,", label: "Settings" },
  { keys: "Ctrl+Shift+/", label: "Keyboard Shortcuts" },
  { keys: "Ctrl+W", label: "Close Tab" },
];

const recentFiles = [
  { name: "src/App.tsx", path: "src/App.tsx" },
  { name: "src/index.tsx", path: "src/index.tsx" },
  { name: "package.json", path: "package.json" },
  { name: "README.md", path: "README.md" },
];

export function WelcomeTab(props: Props) {
  return (
    <div class="welcome-tab">
      <div class="welcome-content">
        <div class="welcome-brand">
          <div class="welcome-logo">
            <span class="welcome-logo-text">CX</span>
          </div>
          <h1 class="welcome-title">CodeEX v2</h1>
          <Show when={userProfile()?.name}>
            <p class="welcome-greeting">Welcome, {userProfile()!.name}</p>
          </Show>
          <p class="welcome-subtitle">Sovereign IDE by TerraTech Systems</p>
          <p class="welcome-version">SolidJS + CodeMirror 6 + TerraRuntime</p>
        </div>

        <div class="welcome-columns">
          <div class="welcome-section">
            <h2 class="welcome-section-title">Start</h2>
            <div class="welcome-links">
              <Show when={getCurrentBackend() === "demo" && isFSAccessAvailable()}>
                <button
                  class="welcome-link welcome-open-folder"
                  onClick={async () => {
                    const dir = await upgradeToBrowserFS();
                    if (dir) props.onFolderOpened?.();
                  }}
                >
                  <svg class="welcome-link-svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M1.5 2.5h4l1.5 1.5h7.5v9h-13z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>
                    <path d="M1.5 6h13" stroke="currentColor" stroke-width="1.2"/>
                  </svg>
                  Open Folder...
                </button>
              </Show>
              <For each={recentFiles}>
                {(file) => (
                  <button
                    class="welcome-link"
                    onClick={() => props.onOpenFile?.(file.path)}
                  >
                    <span class="welcome-link-icon">{"\u{1F4C4}"}</span>
                    {file.name}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="welcome-section">
            <h2 class="welcome-section-title">Keyboard Shortcuts</h2>
            <div class="welcome-shortcuts">
              <For each={shortcuts}>
                {(shortcut) => (
                  <div class="welcome-shortcut">
                    <kbd class="welcome-kbd">{shortcut.keys}</kbd>
                    <span class="welcome-shortcut-label">{shortcut.label}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="welcome-footer">
          <span class="welcome-engine">TerraForge Engine</span>
          <span class="welcome-dot">|</span>
          <span class="welcome-model">gixsis-v4.0.1</span>
          <span class="welcome-dot">|</span>
          <span class="welcome-host">TerraForge Engine</span>
        </div>
      </div>

      <style>{`
        .welcome-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
          overflow-y: auto;
        }
        .welcome-content {
          max-width: 600px;
          width: 100%;
          padding: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }
        .welcome-brand {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
        }
        .welcome-logo {
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
          border-radius: var(--radius-lg);
          box-shadow: 0 0 60px rgba(41, 151, 255, 0.15), 0 4px 24px rgba(0, 0, 0, 0.4);
          margin-bottom: var(--space-2);
        }
        .welcome-logo-text {
          font-family: var(--font-mono);
          font-size: 28px;
          font-weight: 800;
          color: white;
          letter-spacing: -0.02em;
        }
        .welcome-title {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          letter-spacing: -0.02em;
        }
        .welcome-greeting {
          font-size: var(--text-lg, 18px);
          font-weight: 500;
          color: var(--text-primary);
          margin: 0;
        }
        .welcome-subtitle {
          font-size: var(--text-md);
          color: var(--text-secondary);
          margin: 0;
        }
        .welcome-version {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          font-family: var(--font-mono);
          margin: 0;
        }
        .welcome-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-6);
        }
        .welcome-section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0 0 var(--space-3) 0;
        }
        .welcome-links {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .welcome-link {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--accent-blue);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          cursor: pointer;
          text-align: left;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .welcome-link:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .welcome-link-icon {
          font-size: 14px;
        }
        .welcome-link-svg {
          flex-shrink: 0;
        }
        .welcome-open-folder {
          color: var(--accent-blue);
          border: 1px dashed rgba(41, 151, 255, 0.35);
          background: rgba(41, 151, 255, 0.05);
          margin-bottom: var(--space-2);
        }
        .welcome-open-folder:hover {
          background: rgba(41, 151, 255, 0.12);
          border-color: rgba(41, 151, 255, 0.5);
          color: var(--accent-blue);
        }
        .welcome-shortcuts {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .welcome-shortcut {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .welcome-kbd {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-secondary);
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 2px 6px;
          min-width: 100px;
          text-align: center;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .welcome-shortcut-label {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }
        .welcome-footer {
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--text-disabled);
          font-family: var(--font-mono);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border-subtle);
        }
        .welcome-dot {
          opacity: 0.3;
        }
      `}</style>
    </div>
  );
}
