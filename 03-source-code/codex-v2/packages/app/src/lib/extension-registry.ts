// ============================================================================
// CodeEX v2 — Extension Registry
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Extension management: install, activate, deactivate, uninstall.
// Built-in extensions ship with CodeEX. User extensions loaded from manifest.
// Contributes API: commands, views, themes, snippets, languages.
// ============================================================================

import type { ExtensionManifest } from "./types";
import {
  activateExtension as hostActivate,
  deactivateExtension as hostDeactivate,
  fireActivationEvent,
  matchesActivationEvent,
  isExtensionActivated,
  getActivatedExtensions,
  disposeAllExtensions,
} from "./extension-host";

// ============================================================================
// Types
// ============================================================================

export interface ExtensionCommand {
  id: string;
  title: string;
  extensionId: string;
  handler?: () => void;
}

export interface ExtensionState {
  manifest: ExtensionManifest;
  enabled: boolean;
  activated: boolean;
  builtin: boolean;
}

// ============================================================================
// State
// ============================================================================

let extensions: ExtensionState[] = [];
let registeredCommands: ExtensionCommand[] = [];
const listeners: Array<() => void> = [];

function notifyListeners() {
  listeners.forEach((fn) => fn());
  document.dispatchEvent(new CustomEvent("codex:extensions-changed", {
    detail: { extensions: getExtensions() },
  }));
}

// ============================================================================
// Built-in Extensions
// ============================================================================

const BUILTIN_EXTENSIONS: ExtensionManifest[] = [
  {
    id: "codex.gixsis-code",
    name: "Gixsis Code",
    version: "4.0.1",
    description: "Sovereign AI assistant — 27 tools, agent mode, voice input, document ingestion",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      commands: [
        { id: "gixsis.chat", title: "Open Gixsis Chat" },
        { id: "gixsis.explain", title: "Explain Selection" },
        { id: "gixsis.refactor", title: "Refactor Selection" },
        { id: "gixsis.plan", title: "Plan Mode" },
      ],
      views: {
        chat: [{ id: "gixsis.chatPanel", name: "Gixsis Chat" }],
      },
    },
  },
  {
    id: "codex.typescript-language",
    name: "TypeScript & JavaScript",
    version: "5.7.0",
    description: "TypeScript and JavaScript language support — IntelliSense, diagnostics, refactoring",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      commands: [
        { id: "typescript.goToDefinition", title: "Go to Definition" },
        { id: "typescript.findReferences", title: "Find All References" },
        { id: "typescript.renameSymbol", title: "Rename Symbol" },
      ],
    },
  },
  {
    id: "codex.theme-dark",
    name: "CodeEX Dark Theme",
    version: "1.0.0",
    description: "Default dark theme with Apple-aesthetic design — 11 built-in themes via theme registry",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      themes: [
        { id: "codex-dark", label: "CodeEX Dark", uiTheme: "vs-dark" },
        { id: "monokai", label: "Monokai", uiTheme: "vs-dark" },
        { id: "dracula", label: "Dracula", uiTheme: "vs-dark" },
        { id: "nord", label: "Nord", uiTheme: "vs-dark" },
        { id: "solarized-dark", label: "Solarized Dark", uiTheme: "vs-dark" },
        { id: "one-dark", label: "One Dark Pro", uiTheme: "vs-dark" },
        { id: "github-dark", label: "GitHub Dark", uiTheme: "vs-dark" },
        { id: "catppuccin-mocha", label: "Catppuccin Mocha", uiTheme: "vs-dark" },
        { id: "high-contrast", label: "High Contrast", uiTheme: "hc-black" },
      ],
    },
  },
  {
    id: "codex.theme-light",
    name: "CodeEX Light Theme",
    version: "1.0.0",
    description: "Light theme variants — CodeEX Light, Solarized Light",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      themes: [
        { id: "codex-light", label: "CodeEX Light", uiTheme: "vs" },
        { id: "solarized-light", label: "Solarized Light", uiTheme: "vs" },
      ],
    },
  },
  {
    id: "codex.git-integration",
    name: "Git",
    version: "1.0.0",
    description: "Git source control integration — stage, commit, diff, log, branch management",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      commands: [
        { id: "git.stage", title: "Git: Stage Changes" },
        { id: "git.commit", title: "Git: Commit" },
        { id: "git.diff", title: "Git: Show Diff" },
      ],
      views: {
        sidebar: [{ id: "git.sourceControl", name: "Source Control" }],
      },
    },
  },
  {
    id: "codex.debug-adapter",
    name: "Debug Adapter",
    version: "1.0.0",
    description: "Debugging support — breakpoints, call stack, variables, stepping",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      commands: [
        { id: "debug.start", title: "Start Debugging" },
        { id: "debug.stop", title: "Stop Debugging" },
        { id: "debug.breakpoint", title: "Toggle Breakpoint" },
      ],
    },
  },
  {
    id: "codex.snippets",
    name: "Code Snippets",
    version: "1.0.0",
    description: "60+ snippets for JavaScript, TypeScript, Python, and Rust",
    author: "TerraTech Systems",
    main: "built-in",
  },
  {
    id: "codex.terminal",
    name: "Integrated Terminal",
    version: "1.0.0",
    description: "PTY terminal with split panes, profile selection, and multiple instances",
    author: "TerraTech Systems",
    main: "built-in",
  },
  {
    id: "codex.mcp-client",
    name: "MCP Client",
    version: "1.0.0",
    description: "Model Context Protocol client — 16 sovereign tools via ageixtic-mcp server",
    author: "TerraTech Systems",
    main: "built-in",
    contributes: {
      commands: [
        { id: "mcp.connect", title: "MCP: Connect to Server" },
        { id: "mcp.status", title: "MCP: Show Status" },
      ],
    },
  },
];

// ============================================================================
// Persistence
// ============================================================================

const STORAGE_KEY = "codex_extensions_state";

function loadState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(): void {
  const state: Record<string, boolean> = {};
  for (const ext of extensions) {
    if (!ext.builtin) {
      state[ext.manifest.id] = ext.enabled;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ============================================================================
// Initialization
// ============================================================================

export function initExtensions(): void {
  const savedState = loadState();

  // Register built-in extensions (always enabled)
  extensions = BUILTIN_EXTENSIONS.map((manifest) => ({
    manifest,
    enabled: true,
    activated: true,
    builtin: true,
  }));

  // Load user-installed extensions from saved state
  for (const [id, enabled] of Object.entries(savedState)) {
    const existing = extensions.find((e) => e.manifest.id === id);
    if (existing) {
      existing.enabled = enabled;
    }
  }

  // Register all commands from enabled extensions
  registeredCommands = [];
  for (const ext of extensions) {
    if (ext.enabled && ext.manifest.contributes?.commands) {
      for (const cmd of ext.manifest.contributes.commands) {
        registeredCommands.push({
          id: cmd.id,
          title: cmd.title,
          extensionId: ext.manifest.id,
        });
      }
    }
  }

  // Activate all enabled extensions in the host
  for (const ext of extensions) {
    if (ext.enabled) {
      hostActivate(ext.manifest);
    }
  }

  // Fire startup activation event
  fireActivationEvent("onStartupFinished");

  // Listen for activation events to activate lazy extensions
  document.addEventListener("codex:activation-event", ((e: CustomEvent) => {
    const event = e.detail?.event;
    if (!event) return;
    for (const ext of extensions) {
      if (ext.enabled && !isExtensionActivated(ext.manifest.id)) {
        if (matchesActivationEvent(ext.manifest, event)) {
          hostActivate(ext.manifest);
        }
      }
    }
  }) as EventListener);

  notifyListeners();
}

// ============================================================================
// Public API
// ============================================================================

export function getExtensions(): ExtensionState[] {
  return [...extensions];
}

export function getEnabledExtensions(): ExtensionState[] {
  return extensions.filter((e) => e.enabled);
}

export function getBuiltinExtensions(): ExtensionState[] {
  return extensions.filter((e) => e.builtin);
}

export function getUserExtensions(): ExtensionState[] {
  return extensions.filter((e) => !e.builtin);
}

export function getExtensionById(id: string): ExtensionState | undefined {
  return extensions.find((e) => e.manifest.id === id);
}

export function getRegisteredCommands(): ExtensionCommand[] {
  return [...registeredCommands];
}

export function onExtensionsChanged(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ============================================================================
// Extension Lifecycle
// ============================================================================

export function installExtension(manifest: ExtensionManifest, code?: string): void {
  if (extensions.some((e) => e.manifest.id === manifest.id)) return;

  extensions.push({
    manifest,
    enabled: true,
    activated: false,
    builtin: false,
  });

  // Register commands
  if (manifest.contributes?.commands) {
    for (const cmd of manifest.contributes.commands) {
      registeredCommands.push({
        id: cmd.id,
        title: cmd.title,
        extensionId: manifest.id,
      });
    }
  }

  // Activate in extension host sandbox
  hostActivate(manifest, code);

  saveState();
  notifyListeners();
}

export function uninstallExtension(id: string): void {
  const ext = extensions.find((e) => e.manifest.id === id);
  if (!ext || ext.builtin) return;

  // Deactivate in extension host
  hostDeactivate(id);

  // Remove commands
  registeredCommands = registeredCommands.filter((c) => c.extensionId !== id);

  extensions = extensions.filter((e) => e.manifest.id !== id);
  saveState();
  notifyListeners();
}

export function enableExtension(id: string): void {
  const ext = extensions.find((e) => e.manifest.id === id);
  if (!ext || ext.enabled) return;

  ext.enabled = true;

  // Register commands
  if (ext.manifest.contributes?.commands) {
    for (const cmd of ext.manifest.contributes.commands) {
      if (!registeredCommands.some((c) => c.id === cmd.id)) {
        registeredCommands.push({
          id: cmd.id,
          title: cmd.title,
          extensionId: ext.manifest.id,
        });
      }
    }
  }

  // Activate in extension host
  hostActivate(ext.manifest);

  saveState();
  notifyListeners();
}

export function disableExtension(id: string): void {
  const ext = extensions.find((e) => e.manifest.id === id);
  if (!ext || !ext.enabled || ext.builtin) return;

  ext.enabled = false;

  // Deactivate in extension host
  hostDeactivate(id);

  registeredCommands = registeredCommands.filter((c) => c.extensionId !== id);

  saveState();
  notifyListeners();
}

export function getExtensionCount(): { total: number; enabled: number; builtin: number } {
  return {
    total: extensions.length,
    enabled: extensions.filter((e) => e.enabled).length,
    builtin: extensions.filter((e) => e.builtin).length,
  };
}

// ============================================================================
// Extension Host Queries (re-exported from extension-host.ts)
// ============================================================================

export { getActivatedExtensions, isExtensionActivated, fireActivationEvent } from "./extension-host";

// ============================================================================
// Marketplace — TerraForge Exchange
// ============================================================================

export type MarketplaceCategory = "languages" | "formatters" | "themes" | "debuggers" | "productivity" | "snippets" | "linters" | "testing";

export interface MarketplaceExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  category: MarketplaceCategory;
  tags: string[];
  featured?: boolean;
}

/** Curated extension catalog — TerraForge Exchange. */
const MARKETPLACE_CATALOG: MarketplaceExtension[] = [
  // Languages
  { id: "terra.go-language", name: "Go", version: "0.42.0", description: "Rich Go language support — IntelliSense, debugging, linting, testing", author: "TerraTech Systems", downloads: 18400, rating: 4.8, category: "languages", tags: ["go", "golang"], featured: true },
  { id: "terra.java-language", name: "Java Extension Pack", version: "1.12.0", description: "Java language support — Maven, Gradle, debugging, test runner", author: "TerraTech Systems", downloads: 14200, rating: 4.6, category: "languages", tags: ["java", "maven", "gradle"] },
  { id: "terra.cpp-language", name: "C/C++", version: "1.21.0", description: "C and C++ language support — IntelliSense, debugging, code formatting", author: "TerraTech Systems", downloads: 22100, rating: 4.7, category: "languages", tags: ["c", "cpp", "clang"] },
  { id: "terra.php-language", name: "PHP Intelephense", version: "1.10.0", description: "PHP language server — code intelligence, diagnostics, formatting", author: "TerraTech Systems", downloads: 8900, rating: 4.5, category: "languages", tags: ["php"] },
  { id: "terra.ruby-language", name: "Ruby", version: "0.28.0", description: "Ruby language support — Solargraph LSP, debugging, linting", author: "TerraTech Systems", downloads: 5600, rating: 4.3, category: "languages", tags: ["ruby", "rails"] },
  { id: "terra.swift-language", name: "Swift", version: "1.8.0", description: "Swift language support — sourcekit-lsp, debugging, package management", author: "TerraTech Systems", downloads: 4200, rating: 4.4, category: "languages", tags: ["swift", "ios", "macos"] },
  // Formatters
  { id: "terra.prettier", name: "Prettier", version: "10.4.0", description: "Opinionated code formatter — JavaScript, TypeScript, CSS, HTML, JSON, Markdown", author: "TerraTech Systems", downloads: 31200, rating: 4.9, category: "formatters", tags: ["formatter", "prettier"], featured: true },
  { id: "terra.black-formatter", name: "Black Formatter", version: "24.2.0", description: "The uncompromising Python code formatter", author: "TerraTech Systems", downloads: 9800, rating: 4.7, category: "formatters", tags: ["python", "formatter", "black"] },
  { id: "terra.clang-format", name: "Clang-Format", version: "18.1.0", description: "C/C++ code formatting using clang-format", author: "TerraTech Systems", downloads: 6100, rating: 4.5, category: "formatters", tags: ["c", "cpp", "formatter"] },
  // Linters
  { id: "terra.eslint", name: "ESLint", version: "9.5.0", description: "Pluggable JavaScript/TypeScript linter — fix problems, enforce style", author: "TerraTech Systems", downloads: 28700, rating: 4.8, category: "linters", tags: ["eslint", "linter", "javascript"], featured: true },
  { id: "terra.pylint", name: "Pylint", version: "3.1.0", description: "Python static analysis tool — find bugs, enforce coding standards", author: "TerraTech Systems", downloads: 7200, rating: 4.4, category: "linters", tags: ["python", "linter"] },
  { id: "terra.clippy", name: "Clippy (Rust Linter)", version: "0.1.80", description: "A collection of lints to catch common Rust mistakes and improve code", author: "TerraTech Systems", downloads: 4500, rating: 4.6, category: "linters", tags: ["rust", "linter", "clippy"] },
  // Themes
  { id: "terra.tokyo-night", name: "Tokyo Night", version: "1.0.6", description: "A clean dark theme that celebrates the lights of Tokyo at night", author: "TerraTech Systems", downloads: 15300, rating: 4.9, category: "themes", tags: ["theme", "dark"], featured: true },
  { id: "terra.gruvbox", name: "Gruvbox Theme", version: "1.13.0", description: "Retro groove color scheme — dark and light variants", author: "TerraTech Systems", downloads: 8700, rating: 4.7, category: "themes", tags: ["theme", "dark", "light", "retro"] },
  { id: "terra.rose-pine", name: "Rose Pine", version: "2.8.0", description: "All natural pine, faux fur and a bit of soho vibes — dark theme", author: "TerraTech Systems", downloads: 6400, rating: 4.8, category: "themes", tags: ["theme", "dark"] },
  { id: "terra.ayu", name: "Ayu", version: "1.2.0", description: "Simple theme with bright colors — Dark, Mirage, and Light variants", author: "TerraTech Systems", downloads: 5100, rating: 4.6, category: "themes", tags: ["theme", "dark", "light"] },
  { id: "terra.material-icon", name: "Material Icon Theme", version: "5.4.0", description: "Material Design icons for files and folders in the explorer", author: "TerraTech Systems", downloads: 19800, rating: 4.9, category: "themes", tags: ["icons", "material"], featured: true },
  // Debuggers
  { id: "terra.codelldb", name: "CodeLLDB", version: "1.10.0", description: "Native debugger for C/C++ and Rust via LLDB", author: "TerraTech Systems", downloads: 7800, rating: 4.7, category: "debuggers", tags: ["debugger", "lldb", "c", "cpp", "rust"] },
  { id: "terra.python-debugger", name: "Python Debugger", version: "2024.6.0", description: "Python debugging support — breakpoints, stepping, watch, evaluation", author: "TerraTech Systems", downloads: 12400, rating: 4.6, category: "debuggers", tags: ["debugger", "python"] },
  // Productivity
  { id: "terra.gitlens", name: "GitLens", version: "15.2.0", description: "Supercharge Git — blame, history, stash, compare, code lens", author: "TerraTech Systems", downloads: 24600, rating: 4.8, category: "productivity", tags: ["git", "blame", "history"], featured: true },
  { id: "terra.docker", name: "Docker", version: "1.28.0", description: "Docker container management — build, run, compose, registry", author: "TerraTech Systems", downloads: 16300, rating: 4.7, category: "productivity", tags: ["docker", "containers", "devops"] },
  { id: "terra.rest-client", name: "REST Client", version: "0.25.0", description: "Send HTTP requests and view responses directly in the editor", author: "TerraTech Systems", downloads: 11200, rating: 4.6, category: "productivity", tags: ["http", "rest", "api"] },
  { id: "terra.todo-tree", name: "Todo Tree", version: "0.0.226", description: "Show TODO, FIXME, HACK comments as a tree in the explorer", author: "TerraTech Systems", downloads: 9400, rating: 4.5, category: "productivity", tags: ["todo", "comments"] },
  { id: "terra.bookmarks", name: "Bookmarks", version: "13.5.0", description: "Mark lines and jump to them — navigate between important positions", author: "TerraTech Systems", downloads: 7100, rating: 4.4, category: "productivity", tags: ["bookmarks", "navigation"] },
  // Testing
  { id: "terra.jest-runner", name: "Jest Runner", version: "0.4.73", description: "Run and debug Jest tests from the editor — inline results, coverage", author: "TerraTech Systems", downloads: 8300, rating: 4.5, category: "testing", tags: ["jest", "testing", "javascript"] },
  { id: "terra.vitest", name: "Vitest", version: "1.2.0", description: "Vitest test runner integration — fast, Vite-native testing", author: "TerraTech Systems", downloads: 6700, rating: 4.7, category: "testing", tags: ["vitest", "testing", "vite"] },
  // Snippets
  { id: "terra.emmet", name: "Emmet", version: "2.4.0", description: "Emmet abbreviations for HTML, CSS, JSX — expand shortcuts to code", author: "TerraTech Systems", downloads: 18900, rating: 4.8, category: "snippets", tags: ["emmet", "html", "css", "abbreviations"], featured: true },
  { id: "terra.react-snippets", name: "React Snippets", version: "4.4.0", description: "React/JSX/TSX snippets — components, hooks, lifecycle, Redux", author: "TerraTech Systems", downloads: 10100, rating: 4.5, category: "snippets", tags: ["react", "jsx", "hooks"] },
];

const MARKETPLACE_CATEGORIES: { id: MarketplaceCategory; label: string }[] = [
  { id: "languages", label: "Languages" },
  { id: "formatters", label: "Formatters" },
  { id: "linters", label: "Linters" },
  { id: "themes", label: "Themes" },
  { id: "debuggers", label: "Debuggers" },
  { id: "productivity", label: "Productivity" },
  { id: "testing", label: "Testing" },
  { id: "snippets", label: "Snippets" },
];

export function getMarketplaceCategories(): { id: MarketplaceCategory; label: string }[] {
  return MARKETPLACE_CATEGORIES;
}

export function getFeaturedExtensions(): MarketplaceExtension[] {
  return MARKETPLACE_CATALOG.filter(e => e.featured).map(e => ({
    ...e,
    installed: extensions.some(inst => inst.manifest.id === e.id),
  }));
}

export function searchMarketplace(query: string, category?: MarketplaceCategory): MarketplaceExtension[] {
  let results = [...MARKETPLACE_CATALOG];
  if (category) {
    results = results.filter(e => e.category === category);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q))
    );
  }
  return results
    .map(e => ({ ...e, installed: extensions.some(inst => inst.manifest.id === e.id) }))
    .sort((a, b) => b.downloads - a.downloads);
}

export function installFromMarketplace(mktExt: MarketplaceExtension): void {
  if (extensions.some(e => e.manifest.id === mktExt.id)) return;
  const manifest: ExtensionManifest = {
    id: mktExt.id,
    name: mktExt.name,
    version: mktExt.version,
    description: mktExt.description,
    author: mktExt.author,
    main: "marketplace",
  };
  installExtension(manifest);
}

export function isMarketplaceInstalled(id: string): boolean {
  return extensions.some(e => e.manifest.id === id);
}

// ============================================================================
// Initialize on import
// ============================================================================

initExtensions();
