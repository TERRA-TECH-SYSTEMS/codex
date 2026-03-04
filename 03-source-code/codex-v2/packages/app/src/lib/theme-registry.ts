// ============================================================================
// CodeEX v2 — Theme Registry
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Custom theme system with built-in themes and user-installable themes.
// Themes are CSS variable override maps applied to document.documentElement.
// ============================================================================

import { createSignal } from "solid-js";

export interface ThemeColors {
  // Backgrounds
  bgBase: string;
  bgSurface: string;
  bgCard: string;
  bgElevated: string;
  bgInput: string;
  bgHover: string;
  bgActive: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textInverse: string;
  // Accents
  accentBlue: string;
  accentPurple: string;
  accentGreen: string;
  accentOrange: string;
  accentRed: string;
  accentTeal: string;
  accentPink: string;
  // Borders
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  // Shadows
  shadowCard: string;
  shadowElevated: string;
  glowBlue: string;
  glowPurple: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  type: "dark" | "light";
  author: string;
  builtin: boolean;
  colors: ThemeColors;
}

// ── Built-in Theme Definitions ──

const DARK_COLORS: ThemeColors = {
  bgBase: "#000000",
  bgSurface: "#0a0a0a",
  bgCard: "#111111",
  bgElevated: "#1a1a1a",
  bgInput: "#0d0d0d",
  bgHover: "#1f1f1f",
  bgActive: "#252525",
  textPrimary: "#f5f5f7",
  textSecondary: "#a1a1a6",
  textTertiary: "#6e6e73",
  textDisabled: "#48484a",
  textInverse: "#000000",
  accentBlue: "#2997ff",
  accentPurple: "#bf5af2",
  accentGreen: "#30d158",
  accentOrange: "#ff9f0a",
  accentRed: "#ff453a",
  accentTeal: "#64d2ff",
  accentPink: "#ff375f",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderDefault: "rgba(255, 255, 255, 0.12)",
  borderStrong: "rgba(255, 255, 255, 0.2)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.4)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.6)",
  glowBlue: "0 0 60px rgba(41, 151, 255, 0.15)",
  glowPurple: "0 0 60px rgba(191, 90, 242, 0.15)",
};

const LIGHT_COLORS: ThemeColors = {
  bgBase: "#ffffff",
  bgSurface: "#f5f5f7",
  bgCard: "#ffffff",
  bgElevated: "#f0f0f2",
  bgInput: "#f5f5f7",
  bgHover: "#e8e8ed",
  bgActive: "#d1d1d6",
  textPrimary: "#1d1d1f",
  textSecondary: "#6e6e73",
  textTertiary: "#86868b",
  textDisabled: "#aeaeb2",
  textInverse: "#ffffff",
  accentBlue: "#0071e3",
  accentPurple: "#a855f7",
  accentGreen: "#34c759",
  accentOrange: "#ff9500",
  accentRed: "#ff3b30",
  accentTeal: "#5ac8fa",
  accentPink: "#ff2d55",
  borderSubtle: "rgba(0, 0, 0, 0.06)",
  borderDefault: "rgba(0, 0, 0, 0.1)",
  borderStrong: "rgba(0, 0, 0, 0.18)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.08)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.12)",
  glowBlue: "0 0 60px rgba(0, 113, 227, 0.1)",
  glowPurple: "0 0 60px rgba(168, 85, 247, 0.1)",
};

const MONOKAI_COLORS: ThemeColors = {
  bgBase: "#272822",
  bgSurface: "#2d2e27",
  bgCard: "#3e3d32",
  bgElevated: "#49483e",
  bgInput: "#2d2e27",
  bgHover: "#3e3d32",
  bgActive: "#49483e",
  textPrimary: "#f8f8f2",
  textSecondary: "#a6a28c",
  textTertiary: "#75715e",
  textDisabled: "#5b5a4f",
  textInverse: "#272822",
  accentBlue: "#66d9ef",
  accentPurple: "#ae81ff",
  accentGreen: "#a6e22e",
  accentOrange: "#fd971f",
  accentRed: "#f92672",
  accentTeal: "#66d9ef",
  accentPink: "#f92672",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderDefault: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(255, 255, 255, 0.18)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.3)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
  glowBlue: "0 0 60px rgba(102, 217, 239, 0.12)",
  glowPurple: "0 0 60px rgba(174, 129, 255, 0.12)",
};

const DRACULA_COLORS: ThemeColors = {
  bgBase: "#282a36",
  bgSurface: "#2d2f3d",
  bgCard: "#343746",
  bgElevated: "#3c3f58",
  bgInput: "#2d2f3d",
  bgHover: "#3c3f58",
  bgActive: "#44475a",
  textPrimary: "#f8f8f2",
  textSecondary: "#bfbfbf",
  textTertiary: "#6272a4",
  textDisabled: "#4a5278",
  textInverse: "#282a36",
  accentBlue: "#8be9fd",
  accentPurple: "#bd93f9",
  accentGreen: "#50fa7b",
  accentOrange: "#ffb86c",
  accentRed: "#ff5555",
  accentTeal: "#8be9fd",
  accentPink: "#ff79c6",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderDefault: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(255, 255, 255, 0.18)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.3)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
  glowBlue: "0 0 60px rgba(139, 233, 253, 0.12)",
  glowPurple: "0 0 60px rgba(189, 147, 249, 0.12)",
};

const NORD_COLORS: ThemeColors = {
  bgBase: "#2e3440",
  bgSurface: "#3b4252",
  bgCard: "#434c5e",
  bgElevated: "#4c566a",
  bgInput: "#3b4252",
  bgHover: "#434c5e",
  bgActive: "#4c566a",
  textPrimary: "#eceff4",
  textSecondary: "#d8dee9",
  textTertiary: "#81a1c1",
  textDisabled: "#616e88",
  textInverse: "#2e3440",
  accentBlue: "#88c0d0",
  accentPurple: "#b48ead",
  accentGreen: "#a3be8c",
  accentOrange: "#d08770",
  accentRed: "#bf616a",
  accentTeal: "#8fbcbb",
  accentPink: "#b48ead",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.25)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.4)",
  glowBlue: "0 0 60px rgba(136, 192, 208, 0.1)",
  glowPurple: "0 0 60px rgba(180, 142, 173, 0.1)",
};

const SOLARIZED_DARK_COLORS: ThemeColors = {
  bgBase: "#002b36",
  bgSurface: "#073642",
  bgCard: "#0a3f4e",
  bgElevated: "#0d4959",
  bgInput: "#073642",
  bgHover: "#0a3f4e",
  bgActive: "#0d4959",
  textPrimary: "#fdf6e3",
  textSecondary: "#93a1a1",
  textTertiary: "#657b83",
  textDisabled: "#586e75",
  textInverse: "#002b36",
  accentBlue: "#268bd2",
  accentPurple: "#6c71c4",
  accentGreen: "#859900",
  accentOrange: "#cb4b16",
  accentRed: "#dc322f",
  accentTeal: "#2aa198",
  accentPink: "#d33682",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.3)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
  glowBlue: "0 0 60px rgba(38, 139, 210, 0.12)",
  glowPurple: "0 0 60px rgba(108, 113, 196, 0.12)",
};

const SOLARIZED_LIGHT_COLORS: ThemeColors = {
  bgBase: "#fdf6e3",
  bgSurface: "#eee8d5",
  bgCard: "#fdf6e3",
  bgElevated: "#e8e1cc",
  bgInput: "#eee8d5",
  bgHover: "#e8e1cc",
  bgActive: "#ddd6c1",
  textPrimary: "#073642",
  textSecondary: "#586e75",
  textTertiary: "#657b83",
  textDisabled: "#93a1a1",
  textInverse: "#fdf6e3",
  accentBlue: "#268bd2",
  accentPurple: "#6c71c4",
  accentGreen: "#859900",
  accentOrange: "#cb4b16",
  accentRed: "#dc322f",
  accentTeal: "#2aa198",
  accentPink: "#d33682",
  borderSubtle: "rgba(0, 0, 0, 0.06)",
  borderDefault: "rgba(0, 0, 0, 0.1)",
  borderStrong: "rgba(0, 0, 0, 0.18)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.06)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.1)",
  glowBlue: "0 0 60px rgba(38, 139, 210, 0.08)",
  glowPurple: "0 0 60px rgba(108, 113, 196, 0.08)",
};

const ONE_DARK_COLORS: ThemeColors = {
  bgBase: "#282c34",
  bgSurface: "#2c313a",
  bgCard: "#333842",
  bgElevated: "#3b4048",
  bgInput: "#2c313a",
  bgHover: "#333842",
  bgActive: "#3b4048",
  textPrimary: "#abb2bf",
  textSecondary: "#828997",
  textTertiary: "#5c6370",
  textDisabled: "#4b5263",
  textInverse: "#282c34",
  accentBlue: "#61afef",
  accentPurple: "#c678dd",
  accentGreen: "#98c379",
  accentOrange: "#d19a66",
  accentRed: "#e06c75",
  accentTeal: "#56b6c2",
  accentPink: "#c678dd",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.3)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
  glowBlue: "0 0 60px rgba(97, 175, 239, 0.12)",
  glowPurple: "0 0 60px rgba(198, 120, 221, 0.12)",
};

const GITHUB_DARK_COLORS: ThemeColors = {
  bgBase: "#0d1117",
  bgSurface: "#161b22",
  bgCard: "#1c2128",
  bgElevated: "#21262d",
  bgInput: "#161b22",
  bgHover: "#1c2128",
  bgActive: "#21262d",
  textPrimary: "#e6edf3",
  textSecondary: "#8b949e",
  textTertiary: "#6e7681",
  textDisabled: "#484f58",
  textInverse: "#0d1117",
  accentBlue: "#58a6ff",
  accentPurple: "#bc8cff",
  accentGreen: "#3fb950",
  accentOrange: "#d29922",
  accentRed: "#f85149",
  accentTeal: "#56d4dd",
  accentPink: "#f778ba",
  borderSubtle: "rgba(255, 255, 255, 0.04)",
  borderDefault: "rgba(240, 246, 252, 0.1)",
  borderStrong: "rgba(240, 246, 252, 0.2)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.4)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.6)",
  glowBlue: "0 0 60px rgba(88, 166, 255, 0.1)",
  glowPurple: "0 0 60px rgba(188, 140, 255, 0.1)",
};

const CATPPUCCIN_MOCHA_COLORS: ThemeColors = {
  bgBase: "#1e1e2e",
  bgSurface: "#24243e",
  bgCard: "#313244",
  bgElevated: "#3b3b52",
  bgInput: "#24243e",
  bgHover: "#313244",
  bgActive: "#3b3b52",
  textPrimary: "#cdd6f4",
  textSecondary: "#a6adc8",
  textTertiary: "#7f849c",
  textDisabled: "#585b70",
  textInverse: "#1e1e2e",
  accentBlue: "#89b4fa",
  accentPurple: "#cba6f7",
  accentGreen: "#a6e3a1",
  accentOrange: "#fab387",
  accentRed: "#f38ba8",
  accentTeal: "#94e2d5",
  accentPink: "#f5c2e7",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.3)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
  glowBlue: "0 0 60px rgba(137, 180, 250, 0.1)",
  glowPurple: "0 0 60px rgba(203, 166, 247, 0.1)",
};

const HIGH_CONTRAST_COLORS: ThemeColors = {
  bgBase: "#000000",
  bgSurface: "#000000",
  bgCard: "#0a0a0a",
  bgElevated: "#1a1a1a",
  bgInput: "#000000",
  bgHover: "#1a1a1a",
  bgActive: "#2a2a2a",
  textPrimary: "#ffffff",
  textSecondary: "#e0e0e0",
  textTertiary: "#c0c0c0",
  textDisabled: "#808080",
  textInverse: "#000000",
  accentBlue: "#6fc3ff",
  accentPurple: "#d9a8ff",
  accentGreen: "#73e06e",
  accentOrange: "#ffc04d",
  accentRed: "#ff6b6b",
  accentTeal: "#80e8f0",
  accentPink: "#ff80ab",
  borderSubtle: "rgba(255, 255, 255, 0.25)",
  borderDefault: "rgba(255, 255, 255, 0.4)",
  borderStrong: "rgba(255, 255, 255, 0.6)",
  shadowCard: "0 0 0 1px rgba(255, 255, 255, 0.4)",
  shadowElevated: "0 0 0 2px rgba(255, 255, 255, 0.4)",
  glowBlue: "0 0 20px rgba(111, 195, 255, 0.3)",
  glowPurple: "0 0 20px rgba(217, 168, 255, 0.3)",
};

// ── Built-in Themes ──

const BUILTIN_THEMES: ThemeDefinition[] = [
  { id: "codex-dark", name: "CodeEX Dark", type: "dark", author: "TerraTech Systems", builtin: true, colors: DARK_COLORS },
  { id: "codex-light", name: "CodeEX Light", type: "light", author: "TerraTech Systems", builtin: true, colors: LIGHT_COLORS },
  { id: "monokai", name: "Monokai", type: "dark", author: "TerraTech Systems", builtin: true, colors: MONOKAI_COLORS },
  { id: "dracula", name: "Dracula", type: "dark", author: "TerraTech Systems", builtin: true, colors: DRACULA_COLORS },
  { id: "nord", name: "Nord", type: "dark", author: "TerraTech Systems", builtin: true, colors: NORD_COLORS },
  { id: "solarized-dark", name: "Solarized Dark", type: "dark", author: "TerraTech Systems", builtin: true, colors: SOLARIZED_DARK_COLORS },
  { id: "solarized-light", name: "Solarized Light", type: "light", author: "TerraTech Systems", builtin: true, colors: SOLARIZED_LIGHT_COLORS },
  { id: "one-dark", name: "One Dark Pro", type: "dark", author: "TerraTech Systems", builtin: true, colors: ONE_DARK_COLORS },
  { id: "github-dark", name: "GitHub Dark", type: "dark", author: "TerraTech Systems", builtin: true, colors: GITHUB_DARK_COLORS },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", type: "dark", author: "TerraTech Systems", builtin: true, colors: CATPPUCCIN_MOCHA_COLORS },
  { id: "high-contrast", name: "High Contrast", type: "dark", author: "TerraTech Systems", builtin: true, colors: HIGH_CONTRAST_COLORS },
];

// ── State ──

const THEMES_STORAGE_KEY = "codex_custom_themes";
const ACTIVE_THEME_KEY = "codex_active_theme";

let allThemes: ThemeDefinition[] = [...BUILTIN_THEMES];
const [activeThemeId, setActiveThemeId] = createSignal<string>(
  localStorage.getItem(ACTIVE_THEME_KEY) || "codex-dark"
);
const listeners: Set<() => void> = new Set();

// Load user themes from localStorage
function loadUserThemes(): void {
  try {
    const raw = localStorage.getItem(THEMES_STORAGE_KEY);
    if (raw) {
      const custom: ThemeDefinition[] = JSON.parse(raw);
      for (const t of custom) {
        t.builtin = false;
        if (!allThemes.find(e => e.id === t.id)) {
          allThemes.push(t);
        }
      }
    }
  } catch {}
}

function saveUserThemes(): void {
  const custom = allThemes.filter(t => !t.builtin);
  localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(custom));
}

function notifyListeners(): void {
  for (const fn of listeners) fn();
  document.dispatchEvent(new CustomEvent("codex:themes-changed"));
}

// ── CSS Variable Mapping ──

const COLOR_TO_CSS: Record<keyof ThemeColors, string> = {
  bgBase: "--bg-base",
  bgSurface: "--bg-surface",
  bgCard: "--bg-card",
  bgElevated: "--bg-elevated",
  bgInput: "--bg-input",
  bgHover: "--bg-hover",
  bgActive: "--bg-active",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textTertiary: "--text-tertiary",
  textDisabled: "--text-disabled",
  textInverse: "--text-inverse",
  accentBlue: "--accent-blue",
  accentPurple: "--accent-purple",
  accentGreen: "--accent-green",
  accentOrange: "--accent-orange",
  accentRed: "--accent-red",
  accentTeal: "--accent-teal",
  accentPink: "--accent-pink",
  borderSubtle: "--border-subtle",
  borderDefault: "--border-default",
  borderStrong: "--border-strong",
  shadowCard: "--shadow-card",
  shadowElevated: "--shadow-elevated",
  glowBlue: "--glow-blue",
  glowPurple: "--glow-purple",
};

/** Apply a theme's CSS variables to the document root. */
function applyThemeColors(theme: ThemeDefinition): void {
  const root = document.documentElement;

  // Set data-theme for any remaining CSS selectors that reference it
  root.setAttribute("data-theme", theme.type);
  root.style.colorScheme = theme.type;

  for (const [key, cssVar] of Object.entries(COLOR_TO_CSS)) {
    const value = theme.colors[key as keyof ThemeColors];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}

// ── Public API ──

/** Get all registered themes. */
export function getThemes(): ThemeDefinition[] {
  return [...allThemes];
}

/** Get built-in themes. */
export function getBuiltinThemes(): ThemeDefinition[] {
  return allThemes.filter(t => t.builtin);
}

/** Get user-installed themes. */
export function getUserThemes(): ThemeDefinition[] {
  return allThemes.filter(t => !t.builtin);
}

/** Get a theme by ID. */
export function getThemeById(id: string): ThemeDefinition | undefined {
  return allThemes.find(t => t.id === id);
}

/** Get the active theme ID (reactive signal). */
export { activeThemeId };

/** Get the active theme definition. */
export function getActiveTheme(): ThemeDefinition {
  return getThemeById(activeThemeId()) || allThemes[0];
}

/** Set the active theme by ID. Applies CSS variables immediately. */
export function setActiveTheme(id: string): void {
  const theme = getThemeById(id);
  if (!theme) return;

  setActiveThemeId(id);
  localStorage.setItem(ACTIVE_THEME_KEY, id);
  applyThemeColors(theme);
  notifyListeners();

  // Dispatch settings-changed so editor reconfigures if needed
  document.dispatchEvent(
    new CustomEvent("codex:settings-changed", {
      detail: { key: "theme", value: theme.type, settings: null },
    }),
  );
}

/** Install a custom theme. */
export function installTheme(theme: ThemeDefinition): void {
  theme.builtin = false;
  const idx = allThemes.findIndex(t => t.id === theme.id);
  if (idx >= 0) {
    allThemes[idx] = theme;
  } else {
    allThemes.push(theme);
  }
  saveUserThemes();
  notifyListeners();
}

/** Uninstall a custom theme. Cannot uninstall built-in themes. */
export function uninstallTheme(id: string): void {
  const theme = getThemeById(id);
  if (!theme || theme.builtin) return;

  allThemes = allThemes.filter(t => t.id !== id);
  saveUserThemes();

  // If uninstalling the active theme, switch to default
  if (activeThemeId() === id) {
    setActiveTheme("codex-dark");
  }
  notifyListeners();
}

/** Subscribe to theme registry changes. Returns unsubscribe function. */
export function onThemesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Get theme count. */
export function getThemeCount(): { total: number; builtin: number; custom: number } {
  const builtin = allThemes.filter(t => t.builtin).length;
  return { total: allThemes.length, builtin, custom: allThemes.length - builtin };
}

// ============================================================================
// Theme Marketplace — Community Themes
// ============================================================================

export interface CommunityTheme {
  id: string;
  name: string;
  type: "dark" | "light";
  author: string;
  description: string;
  downloads: number;
  rating: number;
  previewColors: { bg: string; fg: string; accent: string };
  colors: ThemeColors;
}

const TOKYO_NIGHT_COLORS: ThemeColors = {
  bgBase: "#1a1b26",
  bgSurface: "#1f2335",
  bgCard: "#24283b",
  bgElevated: "#292e42",
  bgInput: "#1f2335",
  bgHover: "#292e42",
  bgActive: "#33395a",
  textPrimary: "#c0caf5",
  textSecondary: "#9aa5ce",
  textTertiary: "#565f89",
  textDisabled: "#3b4261",
  textInverse: "#1a1b26",
  accentBlue: "#7aa2f7",
  accentPurple: "#bb9af7",
  accentGreen: "#9ece6a",
  accentOrange: "#ff9e64",
  accentRed: "#f7768e",
  accentTeal: "#73daca",
  accentPink: "#ff007c",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.35)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.55)",
  glowBlue: "0 0 60px rgba(122, 162, 247, 0.12)",
  glowPurple: "0 0 60px rgba(187, 154, 247, 0.12)",
};

const GRUVBOX_COLORS: ThemeColors = {
  bgBase: "#282828",
  bgSurface: "#32302f",
  bgCard: "#3c3836",
  bgElevated: "#504945",
  bgInput: "#32302f",
  bgHover: "#3c3836",
  bgActive: "#504945",
  textPrimary: "#ebdbb2",
  textSecondary: "#bdae93",
  textTertiary: "#928374",
  textDisabled: "#665c54",
  textInverse: "#282828",
  accentBlue: "#83a598",
  accentPurple: "#d3869b",
  accentGreen: "#b8bb26",
  accentOrange: "#fe8019",
  accentRed: "#fb4934",
  accentTeal: "#8ec07c",
  accentPink: "#d3869b",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.3)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
  glowBlue: "0 0 60px rgba(131, 165, 152, 0.12)",
  glowPurple: "0 0 60px rgba(211, 134, 155, 0.12)",
};

const ROSE_PINE_COLORS: ThemeColors = {
  bgBase: "#191724",
  bgSurface: "#1f1d2e",
  bgCard: "#26233a",
  bgElevated: "#2a283e",
  bgInput: "#1f1d2e",
  bgHover: "#26233a",
  bgActive: "#2a283e",
  textPrimary: "#e0def4",
  textSecondary: "#908caa",
  textTertiary: "#6e6a86",
  textDisabled: "#524f67",
  textInverse: "#191724",
  accentBlue: "#9ccfd8",
  accentPurple: "#c4a7e7",
  accentGreen: "#31748f",
  accentOrange: "#f6c177",
  accentRed: "#eb6f92",
  accentTeal: "#9ccfd8",
  accentPink: "#ebbcba",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  borderDefault: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.35)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.55)",
  glowBlue: "0 0 60px rgba(156, 207, 216, 0.1)",
  glowPurple: "0 0 60px rgba(196, 167, 231, 0.1)",
};

const AYU_DARK_COLORS: ThemeColors = {
  bgBase: "#0b0e14",
  bgSurface: "#0d1017",
  bgCard: "#131721",
  bgElevated: "#1a1f29",
  bgInput: "#0d1017",
  bgHover: "#131721",
  bgActive: "#1a1f29",
  textPrimary: "#bfbdb6",
  textSecondary: "#8b8680",
  textTertiary: "#636a6f",
  textDisabled: "#454b54",
  textInverse: "#0b0e14",
  accentBlue: "#39bae6",
  accentPurple: "#d2a6ff",
  accentGreen: "#7fd962",
  accentOrange: "#ffb454",
  accentRed: "#f07178",
  accentTeal: "#95e6cb",
  accentPink: "#f07178",
  borderSubtle: "rgba(255, 255, 255, 0.04)",
  borderDefault: "rgba(255, 255, 255, 0.07)",
  borderStrong: "rgba(255, 255, 255, 0.14)",
  shadowCard: "0 4px 24px rgba(0, 0, 0, 0.4)",
  shadowElevated: "0 8px 32px rgba(0, 0, 0, 0.6)",
  glowBlue: "0 0 60px rgba(57, 186, 230, 0.1)",
  glowPurple: "0 0 60px rgba(210, 166, 255, 0.1)",
};

const COMMUNITY_THEMES: CommunityTheme[] = [
  { id: "tokyo-night", name: "Tokyo Night", type: "dark", author: "Community", description: "A clean dark theme celebrating the lights of Tokyo at night", downloads: 15300, rating: 4.9, previewColors: { bg: "#1a1b26", fg: "#c0caf5", accent: "#7aa2f7" }, colors: TOKYO_NIGHT_COLORS },
  { id: "gruvbox-dark", name: "Gruvbox Dark", type: "dark", author: "Community", description: "Retro groove color scheme — warm, earthy tones", downloads: 8700, rating: 4.7, previewColors: { bg: "#282828", fg: "#ebdbb2", accent: "#b8bb26" }, colors: GRUVBOX_COLORS },
  { id: "rose-pine", name: "Rose Pine", type: "dark", author: "Community", description: "All natural pine, faux fur and a bit of soho vibes", downloads: 6400, rating: 4.8, previewColors: { bg: "#191724", fg: "#e0def4", accent: "#c4a7e7" }, colors: ROSE_PINE_COLORS },
  { id: "ayu-dark", name: "Ayu Dark", type: "dark", author: "Community", description: "Simple theme with bright colors for Ayu dark variant", downloads: 5100, rating: 4.6, previewColors: { bg: "#0b0e14", fg: "#bfbdb6", accent: "#ffb454" }, colors: AYU_DARK_COLORS },
];

/** Get community themes available for install. */
export function getCommunityThemes(): (CommunityTheme & { installed: boolean })[] {
  return COMMUNITY_THEMES.map(t => ({
    ...t,
    installed: allThemes.some(e => e.id === t.id),
  }));
}

/** Install a community theme from the marketplace catalog. */
export function installCommunityTheme(communityTheme: CommunityTheme): void {
  if (allThemes.some(t => t.id === communityTheme.id)) return;
  installTheme({
    id: communityTheme.id,
    name: communityTheme.name,
    type: communityTheme.type,
    author: communityTheme.author,
    builtin: false,
    colors: communityTheme.colors,
  });
}

/** Check if a community theme is already installed. */
export function isCommunityThemeInstalled(id: string): boolean {
  return allThemes.some(t => t.id === id);
}

// ── Initialize ──

loadUserThemes();

// Apply the stored active theme on load
const stored = getThemeById(activeThemeId());
if (stored) {
  applyThemeColors(stored);
}
