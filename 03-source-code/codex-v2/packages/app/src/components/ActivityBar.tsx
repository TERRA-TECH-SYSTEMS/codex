// ============================================================================
// CodeEX v2 — Activity Bar (Left icon strip)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { For, Show, createSignal } from "solid-js";
import type { PanelView } from "~/lib/types";
import { userProfile, authStatus } from "~/lib/auth-store";
import { getUserInitials, logout } from "~/lib/auth-store";

interface Props {
  activePanel: PanelView;
  onPanelChange: (panel: PanelView) => void;
  onToggleChat: () => void;
  chatVisible: boolean;
}

// SVG icon paths (20x20 viewBox)
const ICON_FILES = "M4 2h8l4 4v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm7 0v5h5M7 12h6M7 8h3";
const ICON_SEARCH = "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z";
const ICON_GIT = "M10 2a8 8 0 100 16 8 8 0 000-16zm0 3a2 2 0 110 4 2 2 0 010-4zm0 6a2 2 0 110 4 2 2 0 010-4zM8 10h4";
const ICON_EXT = "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5";
const ICON_TESTS = "M3 3v2h2V3H3zm4 0v2h2V3H7zm4 0v2h2V3h-2zm-8 4v2h2V7H3zm4 0v2h2V7H7zm4 0v2h2V7h-2zM3 11v2h2v-2H3zm4 0v2h2v-2H7zm4 0v2h2v-2h-2z";
const ICON_GIXSIS = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z";

const panels: { id: PanelView; svgPath: string; label: string; viewBox: string; fill: boolean }[] = [
  { id: "files", svgPath: ICON_FILES, label: "Explorer", viewBox: "0 0 20 20", fill: false },
  { id: "search", svgPath: ICON_SEARCH, label: "Search", viewBox: "0 0 24 24", fill: true },
  { id: "git", svgPath: ICON_GIT, label: "Source Control", viewBox: "0 0 20 20", fill: false },
  { id: "tests", svgPath: ICON_TESTS, label: "Test Explorer", viewBox: "0 0 16 16", fill: false },
  { id: "extensions", svgPath: ICON_EXT, label: "Extensions", viewBox: "0 0 24 24", fill: false },
];

export function ActivityBar(props: Props) {
  const [accountMenuOpen, setAccountMenuOpen] = createSignal(false);

  const handleAccountClick = () => setAccountMenuOpen((v) => !v);
  const handleSignOut = () => {
    setAccountMenuOpen(false);
    logout({ redirectToLogin: true });
  };
  const handleSettings = () => {
    setAccountMenuOpen(false);
    document.dispatchEvent(new CustomEvent("codex:open-settings"));
  };

  // Close account menu on outside click
  document.addEventListener("mousedown", (e) => {
    if (accountMenuOpen() && !(e.target as HTMLElement)?.closest(".account-menu-container")) {
      setAccountMenuOpen(false);
    }
  });

  return (
    <div class="activity-bar" role="navigation" aria-label="Activity Bar">
      <div class="activity-bar-top" role="toolbar" aria-label="Views">
        <For each={panels}>
          {(panel) => (
            <button
              class={`activity-btn ${props.activePanel === panel.id ? "active" : ""}`}
              title={panel.label}
              aria-label={panel.label}
              aria-pressed={props.activePanel === panel.id}
              onClick={() => props.onPanelChange(panel.id)}
            >
              <svg
                class="activity-svg"
                width="20"
                height="20"
                viewBox={panel.viewBox}
                fill={panel.fill ? "currentColor" : "none"}
                stroke={panel.fill ? "none" : "currentColor"}
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d={panel.svgPath} />
              </svg>
            </button>
          )}
        </For>
      </div>

      <div class="activity-bar-bottom">
        <button
          class={`activity-btn gixsis-btn ${props.chatVisible ? "active" : ""}`}
          title="Gixsis AI"
          onClick={props.onToggleChat}
        >
          <svg class="activity-svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d={ICON_GIXSIS} />
          </svg>
        </button>

        {/* Account button with dropdown */}
        <div class="account-menu-container">
          <button
            class="activity-btn account-btn"
            title={userProfile()?.name ?? "Account"}
            onClick={handleAccountClick}
          >
            <Show when={userProfile()?.avatar} fallback={
              <span class="account-initials">{getUserInitials(userProfile())}</span>
            }>
              <img class="account-avatar" src={userProfile()!.avatar!} alt="Avatar" />
            </Show>
          </button>
          <Show when={accountMenuOpen()}>
            <div class="account-dropdown">
              <div class="account-dropdown-header">
                <Show when={userProfile()?.avatar} fallback={
                  <span class="account-dropdown-initials">{getUserInitials(userProfile())}</span>
                }>
                  <img class="account-dropdown-avatar" src={userProfile()!.avatar!} alt="Avatar" />
                </Show>
                <div class="account-dropdown-info">
                  <span class="account-dropdown-name">{userProfile()?.name ?? "User"}</span>
                  <span class="account-dropdown-email">{userProfile()?.email ?? ""}</span>
                </div>
              </div>
              <div class="account-dropdown-divider" />
              <button class="account-dropdown-item" onClick={handleSettings}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                Settings
              </button>
              <button class="account-dropdown-item account-signout" onClick={handleSignOut}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          </Show>
        </div>
      </div>

      <style>{`
        .activity-bar {
          width: var(--activity-bar-width);
          min-width: var(--activity-bar-width);
          background: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2) 0;
        }
        .activity-bar-top, .activity-bar-bottom {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
        }
        .activity-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          color: var(--text-tertiary);
          transition: all var(--duration-fast) var(--ease-out);
          position: relative;
        }
        .activity-btn:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .activity-btn.active {
          color: var(--text-primary);
        }
        .activity-btn.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 25%;
          height: 50%;
          width: 2px;
          background: var(--accent-blue);
          border-radius: 0 2px 2px 0;
        }
        .activity-svg {
          width: 20px;
          height: 20px;
        }
        .gixsis-btn.active::before {
          background: var(--accent-purple);
        }

        /* Account button */
        .account-menu-container {
          position: relative;
        }
        .account-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          margin-top: var(--space-1);
        }
        .account-initials {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-primary);
          background: var(--bg-hover);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          letter-spacing: 0.02em;
          border: 1.5px solid var(--border-subtle);
        }
        .account-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
        }

        /* Account dropdown */
        .account-dropdown {
          position: absolute;
          left: calc(100% + 8px);
          bottom: 0;
          width: 260px;
          background: var(--bg-elevated, var(--bg-card));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          padding: var(--space-2) 0;
          animation: accountSlideIn 150ms var(--ease-out);
        }
        @keyframes accountSlideIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .account-dropdown-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
        }
        .account-dropdown-initials {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          background: var(--bg-hover);
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid var(--border-subtle);
        }
        .account-dropdown-avatar {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 50%;
          object-fit: cover;
        }
        .account-dropdown-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .account-dropdown-name {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .account-dropdown-email {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .account-dropdown-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-2) 0;
        }
        .account-dropdown-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: 100%;
          padding: var(--space-2) var(--space-4);
          background: none;
          border: none;
          color: var(--text-secondary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          text-align: left;
        }
        .account-dropdown-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .account-signout:hover {
          color: var(--accent-red, #ff453a);
        }
      `}</style>
    </div>
  );
}
