// ============================================================================
// CodeEX v2 — Debug Launch Configuration
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Parses .codex/launch.json and .vscode/launch.json debug configurations.
// Supports Node.js, Python, and LLDB/CodeLLDB debug adapter types.
// ============================================================================

import { createSignal } from "solid-js";
import { getFS } from "./filesystem";

// ============================================================================
// Types
// ============================================================================

export interface LaunchConfig {
  name: string;
  type: string;
  request: "launch" | "attach";
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  console?: "internalConsole" | "integratedTerminal" | "externalTerminal";
  stopOnEntry?: boolean;
  port?: number;
  host?: string;
  // Node.js specific
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  sourceMaps?: boolean;
  outFiles?: string[];
  // Python specific
  module?: string;
  justMyCode?: boolean;
  // Rust/LLDB specific
  cargo?: { args: string[]; filter?: { name?: string; kind?: string } };
  sourceLanguages?: string[];
  // Raw extra properties passed to the adapter
  [key: string]: any;
}

export interface LaunchConfigFile {
  version: string;
  configurations: LaunchConfig[];
  compounds?: Array<{ name: string; configurations: string[] }>;
}

// ============================================================================
// State
// ============================================================================

const [launchConfigs, setLaunchConfigs] = createSignal<LaunchConfig[]>([]);
const [selectedConfig, setSelectedConfig] = createSignal<string | null>(null);

export { launchConfigs, selectedConfig, setSelectedConfig };

// ============================================================================
// Default Configurations by Type
// ============================================================================

const DEFAULT_CONFIGS: Record<string, LaunchConfig> = {
  "Node.js: Launch Program": {
    name: "Node.js: Launch Program",
    type: "node",
    request: "launch",
    program: "${workspaceFolder}/index.js",
    cwd: "${workspaceFolder}",
    console: "integratedTerminal",
    sourceMaps: true,
  },
  "Node.js: Attach": {
    name: "Node.js: Attach",
    type: "node",
    request: "attach",
    port: 9229,
    host: "localhost",
  },
  "Python: Current File": {
    name: "Python: Current File",
    type: "python",
    request: "launch",
    program: "${file}",
    cwd: "${workspaceFolder}",
    console: "integratedTerminal",
    justMyCode: true,
  },
  "Rust: Launch (cargo)": {
    name: "Rust: Launch (cargo)",
    type: "lldb",
    request: "launch",
    cargo: { args: ["build"], filter: { kind: "bin" } },
    cwd: "${workspaceFolder}",
    sourceLanguages: ["rust"],
  },
};

export function getDefaultConfigs(): LaunchConfig[] {
  return Object.values(DEFAULT_CONFIGS);
}

// ============================================================================
// Variable Substitution
// ============================================================================

/** Resolve VS Code-style variables in config values. */
export function resolveVariables(
  config: LaunchConfig,
  workspaceFolder: string,
  activeFile?: string,
): LaunchConfig {
  const vars: Record<string, string> = {
    "${workspaceFolder}": workspaceFolder,
    "${workspaceRoot}": workspaceFolder,
    "${file}": activeFile ?? "",
    "${fileBasename}": activeFile?.split(/[/\\]/).pop() ?? "",
    "${fileBasenameNoExtension}": (activeFile?.split(/[/\\]/).pop() ?? "").replace(/\.[^.]+$/, ""),
    "${fileDirname}": activeFile?.split(/[/\\]/).slice(0, -1).join("/") ?? "",
    "${fileExtname}": activeFile?.match(/\.[^.]+$/)?.[0] ?? "",
    "${cwd}": workspaceFolder,
    "${pathSeparator}": "/",
  };

  const resolve = (val: any): any => {
    if (typeof val === "string") {
      let result = val;
      for (const [varName, varValue] of Object.entries(vars)) {
        result = result.replaceAll(varName, varValue);
      }
      return result;
    }
    if (Array.isArray(val)) return val.map(resolve);
    if (val && typeof val === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = resolve(v);
      }
      return out;
    }
    return val;
  };

  return resolve(config) as LaunchConfig;
}

// ============================================================================
// Load Launch Configurations
// ============================================================================

export async function loadLaunchConfigs(workspaceRoot?: string): Promise<void> {
  const fs = getFS();
  const configs: LaunchConfig[] = [];

  // Try .codex/launch.json first
  const codexPath = workspaceRoot ? `${workspaceRoot}/.codex/launch.json` : ".codex/launch.json";
  try {
    const content = await fs.readFile(codexPath);
    const parsed = parseJsonWithComments(content);
    if (parsed?.configurations) {
      configs.push(...parsed.configurations);
    }
  } catch {}

  // Try .vscode/launch.json for VS Code compatibility
  const vscodePath = workspaceRoot ? `${workspaceRoot}/.vscode/launch.json` : ".vscode/launch.json";
  try {
    const content = await fs.readFile(vscodePath);
    const parsed = parseJsonWithComments(content);
    if (parsed?.configurations) {
      // Avoid duplicates by name
      for (const config of parsed.configurations) {
        if (!configs.some(c => c.name === config.name)) {
          configs.push(config);
        }
      }
    }
  } catch {}

  // If no configs found, provide defaults
  if (configs.length === 0) {
    configs.push(...getDefaultConfigs());
  }

  setLaunchConfigs(configs);

  // Select first config if none selected
  if (!selectedConfig() && configs.length > 0) {
    setSelectedConfig(configs[0].name);
  }

  document.dispatchEvent(new CustomEvent("codex:debug-configs-loaded", {
    detail: { count: configs.length },
  }));
}

/** Get the currently selected launch configuration. */
export function getSelectedLaunchConfig(): LaunchConfig | null {
  const name = selectedConfig();
  if (!name) return null;
  return launchConfigs().find(c => c.name === name) ?? null;
}

/** Get a launch configuration by name. */
export function getLaunchConfigByName(name: string): LaunchConfig | null {
  return launchConfigs().find(c => c.name === name) ?? null;
}

/** Determine the debug adapter command for a launch config type. */
export function getAdapterCommand(type: string): { command: string; args: string[] } | null {
  switch (type) {
    case "node":
    case "pwa-node":
      return { command: "js-debug-adapter", args: [] };
    case "python":
      return { command: "python", args: ["-m", "debugpy.adapter"] };
    case "lldb":
      return { command: "lldb-vscode", args: [] };
    case "codelldb":
      return { command: "codelldb", args: ["--port", "0"] };
    default:
      return null;
  }
}

// ============================================================================
// JSON with Comments Parser (JSONC — launch.json supports // comments)
// ============================================================================

function parseJsonWithComments(text: string): any {
  // Strip single-line comments
  const stripped = text
    .split("\n")
    .map(line => {
      // Remove // comments (but not inside strings)
      let inString = false;
      let escaped = false;
      for (let i = 0; i < line.length; i++) {
        if (escaped) { escaped = false; continue; }
        if (line[i] === "\\") { escaped = true; continue; }
        if (line[i] === '"') { inString = !inString; continue; }
        if (!inString && line[i] === "/" && line[i + 1] === "/") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");

  // Strip block comments /* ... */
  const noBlocks = stripped.replace(/\/\*[\s\S]*?\*\//g, "");

  // Handle trailing commas (common in VS Code JSON)
  const noTrailing = noBlocks.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(noTrailing);
}
