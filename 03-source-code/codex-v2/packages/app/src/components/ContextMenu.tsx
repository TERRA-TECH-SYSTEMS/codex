// ============================================================================
// CodeEX v2 — Context Menu (Right-Click)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Reusable context menu component. Position and items provided by parent.
// ============================================================================

import { Show, For, onMount, onCleanup } from "solid-js";

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  divider?: boolean;
  disabled?: boolean;
  action: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu(props: Props) {
  let menuRef: HTMLDivElement | undefined;

  onMount(() => {
    const handleClick = () => props.onClose();
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      props.onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    });

    // Adjust position if menu goes off-screen
    if (menuRef) {
      const rect = menuRef.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menuRef.style.left = `${props.x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menuRef.style.top = `${props.y - rect.height}px`;
      }
    }
  });

  return (
    <div
      ref={menuRef}
      class="context-menu"
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <For each={props.items}>
        {(item) => (
          <>
            <Show when={item.divider}>
              <div class="ctx-divider" />
            </Show>
            <div
              class={`ctx-item ${item.disabled ? "disabled" : ""}`}
              onClick={() => {
                if (!item.disabled) {
                  item.action();
                  props.onClose();
                }
              }}
            >
              <span class="ctx-label">{item.label}</span>
              <Show when={item.shortcut}>
                <span class="ctx-shortcut">{item.shortcut}</span>
              </Show>
            </div>
          </>
        )}
      </For>

      <style>{`
        .context-menu {
          position: fixed;
          z-index: 2000;
          min-width: 180px;
          max-width: 280px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-elevated);
          padding: var(--space-1) 0;
          backdrop-filter: blur(16px);
        }
        .ctx-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 28px;
          padding: 0 var(--space-3);
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--text-primary);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .ctx-item:hover:not(.disabled) {
          background: var(--accent-blue);
          color: white;
        }
        .ctx-item:hover:not(.disabled) .ctx-shortcut {
          color: rgba(255, 255, 255, 0.7);
        }
        .ctx-item.disabled {
          color: var(--text-disabled);
          cursor: default;
        }
        .ctx-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ctx-shortcut {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-left: var(--space-4);
          font-family: var(--font-mono);
          flex-shrink: 0;
        }
        .ctx-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-1) 0;
        }
      `}</style>
    </div>
  );
}
