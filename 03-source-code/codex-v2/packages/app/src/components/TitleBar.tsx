// ============================================================================
// CodeEX v2 — Title Bar with Application Menu
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Implements a VS Code-style menu bar (File, Edit, View, Help) between the
// app title and window control buttons.
// ============================================================================

import { createSignal, Show, For, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ── Types ──────────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
}

interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItem[];
}

// ── Custom event dispatch helper ──────────────────────────────────────────

function dispatchCodexEvent(name: string) {
  window.dispatchEvent(new CustomEvent(`codex:${name}`));
}

// Simulate a keyboard shortcut by dispatching a native KeyboardEvent
function simulateShortcut(key: string, ctrl = true, shift = false) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: ctrl,
      shiftKey: shift,
      bubbles: true,
    })
  );
}

// ── Menu Definitions ──────────────────────────────────────────────────────

const MENUS: MenuDefinition[] = [
  {
    id: "file",
    label: "File",
    items: [
      { label: "New File", shortcut: "Ctrl+N", action: () => dispatchCodexEvent("new-file") },
      { label: "Open Folder...", action: () => dispatchCodexEvent("open-folder") },
      { label: "Save", shortcut: "Ctrl+S", action: () => dispatchCodexEvent("save-file") },
      { label: "Save All", action: () => dispatchCodexEvent("save-all") },
      { separator: true, label: "" },
      { label: "Preferences \u2192 Settings", shortcut: "Ctrl+,", action: () => dispatchCodexEvent("open-settings") },
      { separator: true, label: "" },
      { label: "Close Tab", shortcut: "Ctrl+W", action: () => dispatchCodexEvent("close-tab") },
      { separator: true, label: "" },
      { label: "Sign Out", action: () => window.dispatchEvent(new CustomEvent("codex:sign-out")) },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "Ctrl+Z", action: () => simulateShortcut("z") },
      { label: "Redo", shortcut: "Ctrl+Shift+Z", action: () => simulateShortcut("z", true, true) },
      { separator: true, label: "" },
      { label: "Cut", shortcut: "Ctrl+X", action: () => simulateShortcut("x") },
      { label: "Copy", shortcut: "Ctrl+C", action: () => simulateShortcut("c") },
      { label: "Paste", shortcut: "Ctrl+V", action: () => simulateShortcut("v") },
      { separator: true, label: "" },
      { label: "Find", shortcut: "Ctrl+F", action: () => dispatchCodexEvent("find") },
      { label: "Replace", shortcut: "Ctrl+H", action: () => dispatchCodexEvent("replace") },
      { label: "Find in Files", shortcut: "Ctrl+Shift+F", action: () => dispatchCodexEvent("find-in-files") },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      { label: "Command Palette", shortcut: "Ctrl+Shift+P", action: () => dispatchCodexEvent("command-palette") },
      { label: "Quick Open", shortcut: "Ctrl+P", action: () => dispatchCodexEvent("quick-open") },
      { separator: true, label: "" },
      { label: "Toggle Sidebar", shortcut: "Ctrl+B", action: () => dispatchCodexEvent("toggle-sidebar") },
      { label: "Toggle Terminal", shortcut: "Ctrl+`", action: () => dispatchCodexEvent("toggle-terminal") },
      { label: "Toggle Chat", shortcut: "Ctrl+Escape", action: () => dispatchCodexEvent("toggle-chat") },
      { separator: true, label: "" },
      { label: "Zoom In", shortcut: "Ctrl+=", action: () => dispatchCodexEvent("zoom-in") },
      { label: "Zoom Out", shortcut: "Ctrl+-", action: () => dispatchCodexEvent("zoom-out") },
      { label: "Reset Zoom", shortcut: "Ctrl+0", action: () => dispatchCodexEvent("zoom-reset") },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      { label: "Keyboard Shortcuts", shortcut: "Ctrl+Shift+/", action: () => dispatchCodexEvent("keyboard-shortcuts") },
      { label: "About CodeEX", action: () => dispatchCodexEvent("about") },
    ],
  },
];

// ── Window Controls ───────────────────────────────────────────────────────

function handleMinimize() {
  getCurrentWindow().minimize();
}

function handleMaximize() {
  getCurrentWindow().toggleMaximize();
}

function handleClose() {
  getCurrentWindow().close();
}

// ── Component ─────────────────────────────────────────────────────────────

export function TitleBar() {
  const [activeMenu, setActiveMenu] = createSignal<string | null>(null);
  const [focusedItem, setFocusedItem] = createSignal<number>(-1);

  // Close the menu dropdown
  function closeMenu() {
    setActiveMenu(null);
    setFocusedItem(-1);
  }

  // Toggle a menu open/closed on click
  function toggleMenu(id: string) {
    if (activeMenu() === id) {
      closeMenu();
    } else {
      setActiveMenu(id);
      setFocusedItem(-1);
    }
  }

  // When a menu is open, hovering another label switches to it
  function handleMenuHover(id: string) {
    if (activeMenu() !== null && activeMenu() !== id) {
      setActiveMenu(id);
      setFocusedItem(-1);
    }
  }

  // Execute a menu item action and close the menu
  function executeItem(item: MenuItem) {
    if (item.separator) return;
    closeMenu();
    item.action?.();
  }

  // Get the currently active menu definition
  function getActiveMenuDef(): MenuDefinition | undefined {
    return MENUS.find((m) => m.id === activeMenu());
  }

  // Get the index of the active menu in the MENUS array
  function getActiveMenuIndex(): number {
    return MENUS.findIndex((m) => m.id === activeMenu());
  }

  // Get non-separator items for keyboard navigation indexing
  function getActionableItems(menu: MenuDefinition): { item: MenuItem; index: number }[] {
    return menu.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.separator);
  }

  // ── Global event listeners ──

  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".menubar")) {
        closeMenu();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      const open = activeMenu();

      // Escape closes the menu
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        return;
      }

      if (!open) return;

      const menuDef = getActiveMenuDef();
      if (!menuDef) return;

      const actionable = getActionableItems(menuDef);
      const currentFocus = focusedItem();

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          // Find next actionable item
          const nextIdx = actionable.findIndex(({ index }) => index > currentFocus);
          setFocusedItem(nextIdx >= 0 ? actionable[nextIdx].index : actionable[0].index);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          // Find previous actionable item
          const reversed = [...actionable].reverse();
          const prevIdx = reversed.findIndex(({ index }) => index < currentFocus);
          setFocusedItem(prevIdx >= 0 ? reversed[prevIdx].index : reversed[0].index);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const menuIdx = getActiveMenuIndex();
          const prev = menuIdx > 0 ? MENUS[menuIdx - 1] : MENUS[MENUS.length - 1];
          setActiveMenu(prev.id);
          setFocusedItem(-1);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const menuIdx2 = getActiveMenuIndex();
          const next = menuIdx2 < MENUS.length - 1 ? MENUS[menuIdx2 + 1] : MENUS[0];
          setActiveMenu(next.id);
          setFocusedItem(-1);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (currentFocus >= 0) {
            const item = menuDef.items[currentFocus];
            if (item && !item.separator) {
              executeItem(item);
            }
          }
          break;
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <div class="titlebar">
      {/* ── Left: Logo + Menu Bar ── */}
      <div class="titlebar-left">
        <span class="titlebar-logo">CodeEX</span>

        <div class="menubar">
          <For each={MENUS}>
            {(menu) => (
              <div class="menubar-item">
                <button
                  class={`menubar-label ${activeMenu() === menu.id ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMenu(menu.id);
                  }}
                  onMouseEnter={() => handleMenuHover(menu.id)}
                >
                  {menu.label}
                </button>

                <Show when={activeMenu() === menu.id}>
                  <div
                    class="menubar-dropdown"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <For each={menu.items}>
                      {(item, idx) => (
                        <Show
                          when={!item.separator}
                          fallback={<div class="menu-separator" />}
                        >
                          <div
                            class={`menu-item ${focusedItem() === idx() ? "focused" : ""}`}
                            onMouseEnter={() => setFocusedItem(idx())}
                            onMouseLeave={() => setFocusedItem(-1)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              executeItem(item);
                            }}
                          >
                            <span class="menu-item-label">{item.label}</span>
                            <Show when={item.shortcut}>
                              <span class="menu-item-shortcut">{item.shortcut}</span>
                            </Show>
                          </div>
                        </Show>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* ── Center: Drag region ── */}
      <div class="titlebar-drag" />

      {/* ── Right: Window Controls ── */}
      <div class="titlebar-controls">
        <button
          class="titlebar-btn titlebar-btn--minimize"
          onClick={handleMinimize}
          aria-label="Minimize window"
          title="Minimize"
          tabIndex={0}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="4.5" width="8" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </button>
        <button
          class="titlebar-btn titlebar-btn--maximize"
          onClick={handleMaximize}
          aria-label="Maximize window"
          title="Maximize"
          tabIndex={0}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
          </svg>
        </button>
        <button
          class="titlebar-btn titlebar-btn--close"
          onClick={handleClose}
          aria-label="Close window"
          title="Close"
          tabIndex={0}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <style>{`
        /* ── Titlebar Layout ── */
        .titlebar {
          height: var(--titlebar-height);
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          position: relative;
          -webkit-app-region: drag;
          user-select: none;
        }

        /* ── Left Section: Logo + Menu ── */
        .titlebar-left {
          display: flex;
          align-items: center;
          gap: 0;
          height: 100%;
          -webkit-app-region: no-drag;
          flex-shrink: 0;
        }
        .titlebar-logo {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-secondary);
          letter-spacing: 0.02em;
          padding: 0 var(--space-3);
          flex-shrink: 0;
        }

        /* ── Drag Region (fills center) ── */
        .titlebar-drag {
          flex: 1;
          height: 100%;
          -webkit-app-region: drag;
        }

        /* ── Window Controls (right) ── */
        .titlebar-controls {
          display: flex;
          gap: 2px;
          padding-right: var(--space-3);
          -webkit-app-region: no-drag;
          flex-shrink: 0;
        }

        /* ── Window Control Buttons ── */
        .titlebar-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 22px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 0;
          transition: background var(--duration-fast) var(--ease-out),
                      color var(--duration-fast) var(--ease-out);
        }
        .titlebar-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .titlebar-btn:active {
          background: var(--bg-active);
        }
        .titlebar-btn:focus-visible {
          outline: 2px solid var(--accent-blue);
          outline-offset: -2px;
        }

        /* Close button — red accent on hover */
        .titlebar-btn--close:hover {
          background: var(--accent-red);
          color: #ffffff;
        }
        .titlebar-btn--close:active {
          background: #e0332b;
          color: #ffffff;
        }

        /* ── Menu Bar ── */
        .menubar {
          display: flex;
          align-items: center;
          height: 100%;
        }
        .menubar-item {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
        }
        .menubar-label {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 8px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-family: inherit;
          font-size: var(--text-sm);
          cursor: pointer;
          white-space: nowrap;
          transition: background var(--duration-fast) var(--ease-out),
                      color var(--duration-fast) var(--ease-out);
          -webkit-app-region: no-drag;
        }
        .menubar-label:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .menubar-label.active {
          background: var(--bg-active);
          color: var(--text-primary);
        }
        .menubar-label:focus-visible {
          outline: 2px solid var(--accent-blue);
          outline-offset: -2px;
        }

        /* ── Dropdown ── */
        .menubar-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          z-index: 2000;
          min-width: 220px;
          max-width: 300px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 0 0 var(--radius-md) var(--radius-md);
          box-shadow: var(--shadow-elevated);
          padding: var(--space-1) 0;
          -webkit-app-region: no-drag;
        }

        /* ── Menu Items ── */
        .menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 26px;
          padding: 0 var(--space-3);
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--text-primary);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .menu-item:hover,
        .menu-item.focused {
          background: var(--accent-blue);
          color: #ffffff;
        }
        .menu-item:hover .menu-item-shortcut,
        .menu-item.focused .menu-item-shortcut {
          color: rgba(255, 255, 255, 0.7);
        }
        .menu-item-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .menu-item-shortcut {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-left: var(--space-6);
          font-family: var(--font-mono);
          flex-shrink: 0;
          white-space: nowrap;
        }

        /* ── Separator ── */
        .menu-separator {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-1) 0;
        }
      `}</style>
    </div>
  );
}
