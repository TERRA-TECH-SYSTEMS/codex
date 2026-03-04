// ============================================================================
// CodeEX v2 — Theme Provider
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Light/dark mode management with localStorage persistence
// and system preference detection. Integrates with theme-registry.ts
// for custom theme support.
// ============================================================================

import { createSignal } from "solid-js";
import { getActiveTheme, setActiveTheme, activeThemeId } from "./theme-registry";

export type ThemeMode = "dark" | "light";

const [theme, setThemeSignal] = createSignal<ThemeMode>(getActiveTheme().type);

// Theme-registry handles initial application of CSS variables on import

/** Get the current theme mode (dark/light). */
export function getTheme(): ThemeMode {
  return theme();
}

/** Reactive theme signal for SolidJS components. */
export { theme };

/** Get the active theme ID from the registry. */
export function getActiveThemeId(): string {
  return activeThemeId();
}

/** Set the theme. Accepts either a mode ("dark"/"light") for backwards compatibility,
 *  or a full theme ID (e.g. "monokai", "dracula"). */
export function setTheme(modeOrId: string): void {
  // Map legacy "dark"/"light" to default theme IDs
  let themeId = modeOrId;
  if (modeOrId === "dark") themeId = "codex-dark";
  else if (modeOrId === "light") themeId = "codex-light";

  setActiveTheme(themeId);
  const active = getActiveTheme();
  setThemeSignal(active.type);
}

/** Toggle between light and dark (legacy convenience). */
export function toggleTheme(): void {
  setTheme(theme() === "dark" ? "light" : "dark");
}
