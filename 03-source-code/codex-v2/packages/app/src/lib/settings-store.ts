// ============================================================================
// CodeEX v2 — Centralized Settings Store
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Reactive settings with localStorage persistence and event broadcasting.
// All components read settings from this store. Changes dispatch
// codex:settings-changed events so the editor can reconfigure dynamically.
// ============================================================================

import { createSignal } from "solid-js";

export interface EditorSettings {
  // TerraForge
  terraforgeHost: string;
  // Editor
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  cursorBlink: boolean;
  lineNumbers: boolean;
  bracketColorization: boolean;
  renderWhitespace: "none" | "boundary" | "all";
  smoothScrolling: boolean;
  stickyScroll: boolean;
  // Formatting
  formatOnSave: boolean;
  formatOnPaste: boolean;
  // Behavior
  autoSave: boolean;
  autoSaveDelay: number;
  // Appearance
  theme: "dark" | "light";
}

const STORAGE_KEY = "codex-settings";

const DEFAULTS: EditorSettings = {
  terraforgeHost: "http://terraforge.local",
  fontSize: 13,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  cursorBlink: true,
  lineNumbers: true,
  bracketColorization: true,
  renderWhitespace: "none",
  smoothScrolling: true,
  stickyScroll: true,
  formatOnSave: false,
  formatOnPaste: false,
  autoSave: false,
  autoSaveDelay: 1000,
  theme: "dark",
};

function load(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

function save(settings: EditorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

const [settings, setSettingsSignal] = createSignal<EditorSettings>(load());

/** Get the current settings (reactive signal). */
export function getSettings(): EditorSettings {
  return settings();
}

/** Reactive settings signal for SolidJS components. */
export { settings };

/** Update one or more settings. Persists and broadcasts change event. */
export function updateSettings<K extends keyof EditorSettings>(
  key: K,
  value: EditorSettings[K],
): void {
  const next = { ...settings(), [key]: value };
  setSettingsSignal(next);
  save(next);
  document.dispatchEvent(
    new CustomEvent("codex:settings-changed", {
      detail: { key, value, settings: next },
    }),
  );
}

/** Update multiple settings at once. */
export function updateSettingsBatch(
  updates: Partial<EditorSettings>,
): void {
  const next = { ...settings(), ...updates };
  setSettingsSignal(next);
  save(next);
  document.dispatchEvent(
    new CustomEvent("codex:settings-changed", {
      detail: { key: "batch", value: updates, settings: next },
    }),
  );
}

/** Get default settings. */
export function getDefaults(): EditorSettings {
  return { ...DEFAULTS };
}

/** Reset all settings to defaults. */
export function resetSettings(): void {
  setSettingsSignal({ ...DEFAULTS });
  save(DEFAULTS);
  document.dispatchEvent(
    new CustomEvent("codex:settings-changed", {
      detail: { key: "reset", value: null, settings: DEFAULTS },
    }),
  );
}

// ============================================================================
// Workspace Settings (.codex/settings.json)
// ============================================================================

let workspaceRoot = "";
let workspaceOverrides: Partial<EditorSettings> = {};
const [hasWorkspaceSettings, setHasWorkspaceSettings] = createSignal(false);

/** Get workspace root path. */
export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

/** Check if workspace settings are active. */
export { hasWorkspaceSettings };

/** Get workspace settings overrides. */
export function getWorkspaceOverrides(): Partial<EditorSettings> {
  return { ...workspaceOverrides };
}

/** Load workspace settings from .codex/settings.json in the workspace root. */
export async function loadWorkspaceSettings(root: string): Promise<void> {
  workspaceRoot = root;
  try {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) return;

    const settingsPath = `${root}/.codex/settings.json`;
    const exists: boolean = await tr.core.invoke("file_exists", { path: settingsPath });
    if (!exists) {
      setHasWorkspaceSettings(false);
      workspaceOverrides = {};
      return;
    }

    const content: string = await tr.core.invoke("read_file", { path: settingsPath });
    const parsed = JSON.parse(content);
    workspaceOverrides = {};

    // Only apply known settings keys
    for (const key of Object.keys(DEFAULTS) as (keyof EditorSettings)[]) {
      if (key in parsed) {
        (workspaceOverrides as any)[key] = parsed[key];
      }
    }

    setHasWorkspaceSettings(true);

    // Apply workspace overrides on top of user settings
    if (Object.keys(workspaceOverrides).length > 0) {
      const merged = { ...settings(), ...workspaceOverrides };
      setSettingsSignal(merged);
      document.dispatchEvent(
        new CustomEvent("codex:settings-changed", {
          detail: { key: "workspace", value: workspaceOverrides, settings: merged },
        }),
      );
    }
  } catch {
    setHasWorkspaceSettings(false);
    workspaceOverrides = {};
  }
}

/** Save workspace settings to .codex/settings.json. */
export async function saveWorkspaceSettings(overrides: Partial<EditorSettings>): Promise<void> {
  if (!workspaceRoot) return;
  try {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) return;

    const dirPath = `${workspaceRoot}/.codex`;
    const dirExists: boolean = await tr.core.invoke("file_exists", { path: dirPath });
    if (!dirExists) {
      await tr.core.invoke("create_dir", { path: dirPath });
    }

    const settingsPath = `${dirPath}/settings.json`;
    await tr.core.invoke("write_file", {
      path: settingsPath,
      content: JSON.stringify(overrides, null, 2),
    });

    workspaceOverrides = overrides;
    setHasWorkspaceSettings(true);
  } catch {
    // Workspace save is best-effort
  }
}

// ============================================================================
// Settings Sync — Export/Import/File-Based Synchronization
// ============================================================================

export interface SyncProfile {
  version: 1;
  timestamp: string;
  machine: string;
  settings: EditorSettings;
  extensions: Record<string, boolean>;
  activeTheme: string;
  snippets: string | null;
  keybindings: string | null;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

const SYNC_STORAGE_KEY = "codex_sync_profile";
const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastSyncTime, setLastSyncTime] = createSignal<string>("");
const [syncError, setSyncError] = createSignal<string>("");

export { syncStatus, lastSyncTime, syncError };

/** Build a sync profile from current state. */
export function exportSettingsProfile(): SyncProfile {
  const extensionsRaw = localStorage.getItem("codex_extensions_state");
  const themeRaw = localStorage.getItem("codex_active_theme");
  const snippetsRaw = localStorage.getItem("codex_user_snippets");

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    machine: getMachineId(),
    settings: settings(),
    extensions: extensionsRaw ? JSON.parse(extensionsRaw) : {},
    activeTheme: themeRaw || "codex-dark",
    snippets: snippetsRaw,
    keybindings: null, // Reserved for custom keybindings
  };
}

/** Export current settings as downloadable JSON string. */
export function exportSettingsAsJSON(): string {
  return JSON.stringify(exportSettingsProfile(), null, 2);
}

/** Import settings from a sync profile. Returns true on success. */
export function importSettingsProfile(profile: SyncProfile): boolean {
  try {
    if (profile.version !== 1) return false;

    // Apply settings
    const merged = { ...DEFAULTS, ...profile.settings };
    setSettingsSignal(merged);
    save(merged);

    // Apply extensions state
    if (profile.extensions && typeof profile.extensions === "object") {
      localStorage.setItem("codex_extensions_state", JSON.stringify(profile.extensions));
    }

    // Apply theme
    if (profile.activeTheme) {
      localStorage.setItem("codex_active_theme", profile.activeTheme);
    }

    // Apply snippets
    if (profile.snippets) {
      localStorage.setItem("codex_user_snippets", profile.snippets);
    }

    // Cache profile for quick re-sync
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(profile));

    setLastSyncTime(profile.timestamp);
    setSyncError("");

    document.dispatchEvent(new CustomEvent("codex:settings-changed", {
      detail: { key: "sync-import", value: null, settings: merged },
    }));

    document.dispatchEvent(new CustomEvent("codex:sync-complete", {
      detail: { direction: "import", timestamp: profile.timestamp },
    }));

    return true;
  } catch (err: any) {
    setSyncError(err.message || "Import failed");
    return false;
  }
}

/** Import settings from a JSON string. Returns true on success. */
export function importSettingsFromJSON(json: string): boolean {
  try {
    const profile: SyncProfile = JSON.parse(json);
    return importSettingsProfile(profile);
  } catch {
    setSyncError("Invalid JSON");
    return false;
  }
}

/** Sync settings to a file via TerraRuntime. */
export async function syncToFile(filePath?: string): Promise<boolean> {
  setSyncStatus("syncing");
  setSyncError("");

  try {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) {
      // Web fallback: save to localStorage sync cache
      const profile = exportSettingsProfile();
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(profile));
      setLastSyncTime(profile.timestamp);
      setSyncStatus("synced");
      return true;
    }

    const path = filePath || `${getHomePath()}/.codex-sync.json`;
    const profile = exportSettingsProfile();

    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    try {
      const dirExists: boolean = await tr.core.invoke("file_exists", { path: dir });
      if (!dirExists) {
        await tr.core.invoke("create_dir", { path: dir });
      }
    } catch {}

    await tr.core.invoke("write_file", {
      path,
      content: JSON.stringify(profile, null, 2),
    });

    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(profile));
    setLastSyncTime(profile.timestamp);
    setSyncStatus("synced");

    document.dispatchEvent(new CustomEvent("codex:sync-complete", {
      detail: { direction: "export", timestamp: profile.timestamp, path },
    }));

    return true;
  } catch (err: any) {
    setSyncError(err.message || "Sync failed");
    setSyncStatus("error");
    return false;
  }
}

/** Sync settings from a file via TerraRuntime. */
export async function syncFromFile(filePath?: string): Promise<boolean> {
  setSyncStatus("syncing");
  setSyncError("");

  try {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) {
      // Web fallback: load from localStorage sync cache
      const raw = localStorage.getItem(SYNC_STORAGE_KEY);
      if (!raw) {
        setSyncError("No sync profile found");
        setSyncStatus("error");
        return false;
      }
      const profile: SyncProfile = JSON.parse(raw);
      const success = importSettingsProfile(profile);
      setSyncStatus(success ? "synced" : "error");
      return success;
    }

    const path = filePath || `${getHomePath()}/.codex-sync.json`;

    const exists: boolean = await tr.core.invoke("file_exists", { path });
    if (!exists) {
      setSyncError("Sync file not found");
      setSyncStatus("error");
      return false;
    }

    const content: string = await tr.core.invoke("read_file", { path });
    const profile: SyncProfile = JSON.parse(content);
    const success = importSettingsProfile(profile);
    setSyncStatus(success ? "synced" : "error");
    return success;
  } catch (err: any) {
    setSyncError(err.message || "Sync failed");
    setSyncStatus("error");
    return false;
  }
}

/** Get the last synced profile from cache. */
export function getLastSyncProfile(): SyncProfile | null {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Clear sync state. */
export function clearSyncProfile(): void {
  localStorage.removeItem(SYNC_STORAGE_KEY);
  setLastSyncTime("");
  setSyncStatus("idle");
  setSyncError("");
}

// ============================================================================
// Helpers
// ============================================================================

function getMachineId(): string {
  let id = localStorage.getItem("codex_machine_id");
  if (!id) {
    id = `codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("codex_machine_id", id);
  }
  return id;
}

function getHomePath(): string {
  // TerraRuntime provides home dir, fallback to reasonable default
  return (window as any).__CODEX_HOME || "";
}
