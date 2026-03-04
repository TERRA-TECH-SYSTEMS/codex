// ============================================================================
// CodeEX v2 — Notification Toast Display
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { For } from "solid-js";
import { notifications, dismiss, type NotificationType } from "~/lib/notifications";

const typeColors: Record<NotificationType, string> = {
  info: "var(--accent-blue)",
  success: "var(--accent-green)",
  warning: "var(--accent-orange)",
  error: "var(--accent-red)",
};

const typeIcons: Record<NotificationType, string> = {
  info: "i",
  success: "\u2713",
  warning: "!",
  error: "\u2717",
};

export function NotificationToast() {
  return (
    <div class="toast-container">
      <For each={notifications()}>
        {(notif) => (
          <div
            class="toast"
            style={{ "border-left-color": typeColors[notif.type] }}
          >
            <span
              class="toast-icon"
              style={{ color: typeColors[notif.type] }}
            >
              {typeIcons[notif.type]}
            </span>
            <span class="toast-message">{notif.message}</span>
            <button class="toast-dismiss" onClick={() => dismiss(notif.id)}>
              &times;
            </button>
          </div>
        )}
      </For>

      <style>{`
        .toast-container {
          position: fixed;
          bottom: calc(var(--statusbar-height) + var(--space-3));
          right: var(--space-3);
          z-index: 2000;
          display: flex;
          flex-direction: column-reverse;
          gap: var(--space-2);
          pointer-events: none;
          max-width: 400px;
        }
        .toast {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-left: 3px solid;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-elevated);
          pointer-events: auto;
          animation: toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .toast-icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-sm);
          font-weight: 700;
          flex-shrink: 0;
        }
        .toast-message {
          flex: 1;
          font-size: var(--text-sm);
          color: var(--text-primary);
          line-height: 1.4;
        }
        .toast-dismiss {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-disabled);
          font-size: 14px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .toast-dismiss:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
