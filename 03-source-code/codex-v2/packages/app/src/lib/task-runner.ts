// ============================================================================
// CodeEX v2 — Task Runner (Tasks/Build System)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Parses .codex/tasks.json and .vscode/tasks.json task definitions.
// Auto-detects build tasks from package.json, Cargo.toml, Makefile, etc.
// Executes tasks via TerraRuntime run_command with streaming output.
// ============================================================================

import { createSignal } from "solid-js";

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = "idle" | "running" | "success" | "failure" | "cancelled";
export type TaskGroup = "build" | "test" | "clean" | "none";

export interface TaskDefinition {
  label: string;
  type: string; // "shell" | "process" | "npm" | "cargo" | "go" | "python"
  command: string;
  args?: string[];
  group?: TaskGroup | { kind: TaskGroup; isDefault?: boolean };
  cwd?: string;
  env?: Record<string, string>;
  problemMatcher?: string | string[];
  presentation?: {
    reveal?: "always" | "silent" | "never";
    panel?: "shared" | "dedicated" | "new";
    clear?: boolean;
  };
  dependsOn?: string | string[];
  isAutoDetected?: boolean;
  // Raw extra properties
  [key: string]: any;
}

export interface TaskConfigFile {
  version: string;
  tasks: TaskDefinition[];
}

export interface TaskRun {
  label: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  output: string;
}

// ============================================================================
// State
// ============================================================================

const [tasks, setTasks] = createSignal<TaskDefinition[]>([]);
const [taskHistory, setTaskHistory] = createSignal<TaskRun[]>([]);
const [runningTask, setRunningTask] = createSignal<string | null>(null);
const [taskError, setTaskError] = createSignal("");

export { tasks, taskHistory, runningTask, taskError };

// ============================================================================
// TerraRuntime Helpers
// ============================================================================

function hasTerraRuntime(): boolean {
  return !!(window as any).__TAURI__?.core?.invoke;
}

async function runCommand(command: string, timeout = 120_000): Promise<string> {
  const tr = (window as any).__TAURI__;
  if (!tr?.core?.invoke) throw new Error("TerraRuntime not available");
  return Promise.race([
    tr.core.invoke("run_command", { command }) as Promise<string>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Task timed out after ${timeout / 1000}s`)), timeout)
    ),
  ]);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await runCommand(`test -f "${path}" && echo "EXISTS" || echo "MISSING"`, 5000);
    return true;
  } catch {
    return false;
  }
}

async function readFileContent(path: string): Promise<string> {
  return runCommand(`cat "${path}"`, 10_000);
}

// ============================================================================
// JSONC Parser (tasks.json supports // comments like launch.json)
// ============================================================================

function parseJsonWithComments(text: string): any {
  // Strip single-line comments
  const stripped = text
    .split("\n")
    .map(line => {
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

  // Strip block comments
  const noBlocks = stripped.replace(/\/\*[\s\S]*?\*\//g, "");

  // Handle trailing commas
  const noTrailing = noBlocks.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(noTrailing);
}

// ============================================================================
// Variable Substitution
// ============================================================================

let workspaceRoot = "";

export function setTaskWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

function resolveTaskVariables(value: string): string {
  return value
    .replaceAll("${workspaceFolder}", workspaceRoot)
    .replaceAll("${workspaceRoot}", workspaceRoot)
    .replaceAll("${cwd}", workspaceRoot)
    .replaceAll("${pathSeparator}", "/");
}

// ============================================================================
// Task Discovery — Auto-detect from project files
// ============================================================================

async function autoDetectTasks(): Promise<TaskDefinition[]> {
  if (!hasTerraRuntime()) return [];
  const detected: TaskDefinition[] = [];

  // package.json scripts
  try {
    const content = await readFileContent(`${workspaceRoot}/package.json`);
    const pkg = JSON.parse(content);
    if (pkg.scripts) {
      for (const [name, script] of Object.entries(pkg.scripts)) {
        const group: TaskGroup = name === "build" ? "build" : name === "test" ? "test" : name === "clean" ? "clean" : "none";
        detected.push({
          label: `npm: ${name}`,
          type: "npm",
          command: `npm run ${name}`,
          group: name === "build" ? { kind: "build", isDefault: true } : group,
          isAutoDetected: true,
        });
      }
    }
  } catch {}

  // Cargo.toml (Rust)
  try {
    const output = await runCommand(`test -f "${workspaceRoot}/Cargo.toml" && echo "EXISTS"`, 5000);
    if (output.trim().includes("EXISTS")) {
      detected.push(
        { label: "cargo: build", type: "cargo", command: "cargo build", group: { kind: "build", isDefault: !detected.some(t => getTaskGroup(t) === "build") }, isAutoDetected: true },
        { label: "cargo: build --release", type: "cargo", command: "cargo build --release", group: "build", isAutoDetected: true },
        { label: "cargo: test", type: "cargo", command: "cargo test", group: "test", isAutoDetected: true },
        { label: "cargo: check", type: "cargo", command: "cargo check", group: "none", isAutoDetected: true },
        { label: "cargo: clippy", type: "cargo", command: "cargo clippy", group: "none", isAutoDetected: true },
      );
    }
  } catch {}

  // Makefile
  try {
    const output = await runCommand(`test -f "${workspaceRoot}/Makefile" && echo "EXISTS"`, 5000);
    if (output.trim().includes("EXISTS")) {
      detected.push(
        { label: "make: build", type: "shell", command: "make", group: "build", isAutoDetected: true },
        { label: "make: clean", type: "shell", command: "make clean", group: "clean", isAutoDetected: true },
      );
    }
  } catch {}

  // Go (go.mod)
  try {
    const output = await runCommand(`test -f "${workspaceRoot}/go.mod" && echo "EXISTS"`, 5000);
    if (output.trim().includes("EXISTS")) {
      detected.push(
        { label: "go: build", type: "go", command: "go build ./...", group: "build", isAutoDetected: true },
        { label: "go: test", type: "go", command: "go test ./...", group: "test", isAutoDetected: true },
        { label: "go: vet", type: "go", command: "go vet ./...", group: "none", isAutoDetected: true },
      );
    }
  } catch {}

  // Python (pyproject.toml or setup.py)
  try {
    const output = await runCommand(`(test -f "${workspaceRoot}/pyproject.toml" || test -f "${workspaceRoot}/setup.py") && echo "EXISTS"`, 5000);
    if (output.trim().includes("EXISTS")) {
      detected.push(
        { label: "python: pytest", type: "python", command: "python -m pytest", group: "test", isAutoDetected: true },
        { label: "python: build", type: "python", command: "python -m build", group: "build", isAutoDetected: true },
      );
    }
  } catch {}

  return detected;
}

// ============================================================================
// Load Task Configurations
// ============================================================================

export async function discoverTasks(): Promise<void> {
  if (!hasTerraRuntime()) return;
  setTaskError("");

  const configured: TaskDefinition[] = [];

  // Try .codex/tasks.json first
  try {
    const content = await readFileContent(`${workspaceRoot}/.codex/tasks.json`);
    const parsed = parseJsonWithComments(content) as TaskConfigFile;
    if (parsed?.tasks) {
      configured.push(...parsed.tasks);
    }
  } catch {}

  // Try .vscode/tasks.json for VS Code compatibility
  try {
    const content = await readFileContent(`${workspaceRoot}/.vscode/tasks.json`);
    const parsed = parseJsonWithComments(content) as TaskConfigFile;
    if (parsed?.tasks) {
      for (const task of parsed.tasks) {
        if (!configured.some(t => t.label === task.label)) {
          configured.push(task);
        }
      }
    }
  } catch {}

  // Auto-detect tasks from project files
  const autoDetected = await autoDetectTasks();

  // Merge: configured tasks take precedence, auto-detected fill gaps
  const allTasks = [...configured];
  for (const auto of autoDetected) {
    if (!allTasks.some(t => t.label === auto.label)) {
      allTasks.push(auto);
    }
  }

  setTasks(allTasks);

  document.dispatchEvent(new CustomEvent("codex:tasks-discovered", {
    detail: { count: allTasks.length },
  }));
}

// ============================================================================
// Task Execution
// ============================================================================

export async function runTask(label: string): Promise<void> {
  if (!hasTerraRuntime() || runningTask()) return;

  const task = tasks().find(t => t.label === label);
  if (!task) {
    setTaskError(`Task not found: ${label}`);
    return;
  }

  setRunningTask(label);
  setTaskError("");

  const run: TaskRun = {
    label,
    status: "running",
    startTime: Date.now(),
    output: "",
  };

  // Add to history
  setTaskHistory(prev => [run, ...prev].slice(0, 50));

  // Emit task start event
  document.dispatchEvent(new CustomEvent("codex:task-started", {
    detail: { label, command: task.command },
  }));

  // Log to Output panel
  emitOutput("Tasks", `\u25B6 Running task: ${label}`, "info");
  emitOutput("Tasks", `> ${buildCommandString(task)}`, "info");

  try {
    // Resolve dependencies first
    if (task.dependsOn) {
      const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [task.dependsOn];
      for (const dep of deps) {
        emitOutput("Tasks", `Running dependency: ${dep}`, "info");
        await runTask(dep);
      }
    }

    const commandStr = buildCommandString(task);
    const cwd = task.cwd ? resolveTaskVariables(task.cwd) : workspaceRoot;
    const fullCommand = cwd && cwd !== workspaceRoot
      ? `cd "${cwd}" && ${commandStr}`
      : commandStr;

    const output = await runCommand(fullCommand, 300_000); // 5-minute timeout for build tasks

    run.output = output;
    run.status = "success";
    run.endTime = Date.now();
    run.exitCode = 0;

    // Stream output to Output panel
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.trim()) {
        emitOutput("Tasks", line, "info");
      }
    }

    emitOutput("Tasks", `\u2713 Task "${label}" completed in ${formatDuration(run.endTime - run.startTime)}`, "info");

    // Parse output with problem matchers and emit diagnostics
    const diagnostics = parseTaskOutput(task, output);
    if (diagnostics.length > 0) {
      emitTaskDiagnostics(diagnostics);
      emitOutput("Tasks", `Problem matcher found ${diagnostics.length} diagnostic(s)`, "info");
    }

    document.dispatchEvent(new CustomEvent("codex:task-complete", {
      detail: { label, status: "success", exitCode: 0, duration: run.endTime - run.startTime },
    }));
  } catch (err: any) {
    run.status = "failure";
    run.endTime = Date.now();
    run.exitCode = 1;
    run.output = err.message || "Task failed";

    emitOutput("Tasks", err.message || "Task failed", "error");
    emitOutput("Tasks", `\u2715 Task "${label}" failed after ${formatDuration(run.endTime - run.startTime)}`, "error");

    // Parse error output with problem matchers
    const diagnostics = parseTaskOutput(task, run.output);
    if (diagnostics.length > 0) {
      emitTaskDiagnostics(diagnostics);
      emitOutput("Tasks", `Problem matcher found ${diagnostics.length} diagnostic(s)`, "info");
    }

    document.dispatchEvent(new CustomEvent("codex:task-complete", {
      detail: { label, status: "failure", exitCode: 1, duration: run.endTime - run.startTime },
    }));
  } finally {
    setRunningTask(null);
    // Update history entry
    setTaskHistory(prev => prev.map(r => r.startTime === run.startTime ? run : r));
  }
}

/** Run the default build task (Ctrl+Shift+B). */
export async function runBuildTask(): Promise<void> {
  const buildTask = tasks().find(t => {
    const group = getTaskGroup(t);
    if (group !== "build") return false;
    if (typeof t.group === "object" && t.group.isDefault) return true;
    return false;
  }) ?? tasks().find(t => getTaskGroup(t) === "build");

  if (buildTask) {
    await runTask(buildTask.label);
  } else {
    setTaskError("No build task configured");
    emitOutput("Tasks", "No build task configured. Create a tasks.json or add build scripts to package.json.", "warn");
  }
}

/** Run the default test task. */
export async function runTestTask(): Promise<void> {
  const testTask = tasks().find(t => {
    const group = getTaskGroup(t);
    if (group !== "test") return false;
    if (typeof t.group === "object" && t.group.isDefault) return true;
    return false;
  }) ?? tasks().find(t => getTaskGroup(t) === "test");

  if (testTask) {
    await runTask(testTask.label);
  } else {
    setTaskError("No test task configured");
  }
}

// ============================================================================
// Helpers
// ============================================================================

function buildCommandString(task: TaskDefinition): string {
  let cmd = resolveTaskVariables(task.command);
  if (task.args && task.args.length > 0) {
    cmd += " " + task.args.map(a => resolveTaskVariables(a)).join(" ");
  }
  return cmd;
}

function getTaskGroup(task: TaskDefinition): TaskGroup {
  if (!task.group) return "none";
  if (typeof task.group === "string") return task.group;
  return task.group.kind;
}

export function getTaskGroupLabel(task: TaskDefinition): string {
  const group = getTaskGroup(task);
  switch (group) {
    case "build": return "Build";
    case "test": return "Test";
    case "clean": return "Clean";
    default: return "";
  }
}

export function getTaskStatusIcon(status: TaskStatus): string {
  switch (status) {
    case "success": return "\u2713";
    case "failure": return "\u2715";
    case "running": return "\u25D0";
    case "cancelled": return "\u2298";
    default: return "\u25CB";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function emitOutput(channel: string, message: string, level: "info" | "warn" | "error" | "debug"): void {
  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel, level, message },
  }));
}

/** Get all tasks grouped by category. */
export function getTasksByGroup(): { build: TaskDefinition[]; test: TaskDefinition[]; clean: TaskDefinition[]; other: TaskDefinition[] } {
  const all = tasks();
  return {
    build: all.filter(t => getTaskGroup(t) === "build"),
    test: all.filter(t => getTaskGroup(t) === "test"),
    clean: all.filter(t => getTaskGroup(t) === "clean"),
    other: all.filter(t => getTaskGroup(t) === "none"),
  };
}

/** Get the most recent run for a task label. */
export function getLastRun(label: string): TaskRun | undefined {
  return taskHistory().find(r => r.label === label);
}

// ============================================================================
// Problem Matchers — Parse compiler output for diagnostics
// ============================================================================

export interface ProblemMatcher {
  /** Unique name for the matcher. */
  name: string;
  /** Owner identifier (e.g., "typescript", "eslint"). */
  owner: string;
  /** Severity: "error" | "warning" | "info". */
  severity?: "error" | "warning" | "info";
  /** Pattern with named regex groups: file, line, column, message, severity. */
  pattern: {
    regexp: string;
    file: number;
    line: number;
    column?: number;
    message: number;
    severity?: number;
  };
}

export interface TaskDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  owner: string;
}

// Built-in problem matchers matching VS Code's defaults
const BUILTIN_MATCHERS: Record<string, ProblemMatcher> = {
  "$tsc": {
    name: "$tsc",
    owner: "typescript",
    pattern: {
      regexp: "^(.+?)\\((\\d+),(\\d+)\\):\\s+(error|warning|info)\\s+TS\\d+:\\s+(.+)$",
      file: 1, line: 2, column: 3, severity: 4, message: 5,
    },
  },
  "$tsc-watch": {
    name: "$tsc-watch",
    owner: "typescript",
    pattern: {
      regexp: "^(.+?)\\((\\d+),(\\d+)\\):\\s+(error|warning|info)\\s+TS\\d+:\\s+(.+)$",
      file: 1, line: 2, column: 3, severity: 4, message: 5,
    },
  },
  "$eslint-compact": {
    name: "$eslint-compact",
    owner: "eslint",
    pattern: {
      regexp: "^(.+?):\\s+line\\s+(\\d+),\\s+col\\s+(\\d+),\\s+(Error|Warning)\\s+-\\s+(.+)$",
      file: 1, line: 2, column: 3, severity: 4, message: 5,
    },
  },
  "$eslint-stylish": {
    name: "$eslint-stylish",
    owner: "eslint",
    pattern: {
      regexp: "^\\s+(\\d+):(\\d+)\\s+(error|warning)\\s+(.+?)\\s+\\S+$",
      file: 0, line: 1, column: 2, severity: 3, message: 4,
    },
  },
  "$gcc": {
    name: "$gcc",
    owner: "gcc",
    pattern: {
      regexp: "^(.+?):(\\d+):(\\d+):\\s+(error|warning|note):\\s+(.+)$",
      file: 1, line: 2, column: 3, severity: 4, message: 5,
    },
  },
  "$rustc": {
    name: "$rustc",
    owner: "rustc",
    pattern: {
      regexp: "^(error|warning)\\[E\\d+\\]:\\s+(.+)$",
      file: 0, line: 0, message: 2, severity: 1,
    },
  },
  "$go": {
    name: "$go",
    owner: "go",
    pattern: {
      regexp: "^(.+?):(\\d+):(\\d+):\\s+(.+)$",
      file: 1, line: 2, column: 3, message: 4,
    },
  },
  "$python": {
    name: "$python",
    owner: "python",
    pattern: {
      regexp: "^\\s+File\\s+\"(.+?)\",\\s+line\\s+(\\d+)",
      file: 1, line: 2, message: 0,
    },
  },
};

const [customMatchers, setCustomMatchers] = createSignal<Record<string, ProblemMatcher>>({});

/** Register a custom problem matcher. */
export function registerProblemMatcher(matcher: ProblemMatcher): void {
  setCustomMatchers(prev => ({ ...prev, [matcher.name]: matcher }));
}

/** Get all registered problem matchers (built-in + custom). */
export function getProblemMatchers(): Record<string, ProblemMatcher> {
  return { ...BUILTIN_MATCHERS, ...customMatchers() };
}

/** Resolve a problemMatcher reference (string name → matcher definition). */
function resolveMatchers(task: TaskDefinition): ProblemMatcher[] {
  if (!task.problemMatcher) return [];
  const names = typeof task.problemMatcher === "string" ? [task.problemMatcher] : task.problemMatcher;
  const all = getProblemMatchers();
  return names.map(n => all[n]).filter((m): m is ProblemMatcher => !!m);
}

/** Parse task output with the task's problem matchers and emit diagnostics. */
export function parseTaskOutput(task: TaskDefinition, output: string): TaskDiagnostic[] {
  const matchers = resolveMatchers(task);
  if (matchers.length === 0) return [];

  const diagnostics: TaskDiagnostic[] = [];
  const lines = output.split("\n");
  let currentFile = "";

  for (const line of lines) {
    for (const matcher of matchers) {
      try {
        const regex = new RegExp(matcher.pattern.regexp);
        const match = regex.exec(line);
        if (!match) continue;

        const file = matcher.pattern.file > 0 ? match[matcher.pattern.file] : currentFile;
        if (file && matcher.pattern.file > 0) currentFile = file;
        if (!file) continue;

        const lineNum = matcher.pattern.line > 0 ? parseInt(match[matcher.pattern.line], 10) : 1;
        const column = matcher.pattern.column ? parseInt(match[matcher.pattern.column], 10) : 1;
        const message = match[matcher.pattern.message] ?? line;
        const sevStr = matcher.pattern.severity ? (match[matcher.pattern.severity] ?? "").toLowerCase() : "";

        let severity: "error" | "warning" | "info" = matcher.severity ?? "error";
        if (sevStr.startsWith("warn")) severity = "warning";
        else if (sevStr === "info" || sevStr === "note") severity = "info";
        else if (sevStr === "error") severity = "error";

        diagnostics.push({ file, line: lineNum, column, message, severity, owner: matcher.owner });
      } catch {}
    }
  }

  return diagnostics;
}

/** Emit parsed diagnostics to the Problems panel via codex:set-diagnostics event. */
export function emitTaskDiagnostics(diagnostics: TaskDiagnostic[]): void {
  if (diagnostics.length === 0) return;

  // Group by file
  const byFile = new Map<string, TaskDiagnostic[]>();
  for (const d of diagnostics) {
    const existing = byFile.get(d.file) ?? [];
    existing.push(d);
    byFile.set(d.file, existing);
  }

  // Emit as codex:set-diagnostics for Problems panel integration
  document.dispatchEvent(new CustomEvent("codex:set-diagnostics", {
    detail: {
      source: "task-runner",
      diagnostics: diagnostics.map(d => ({
        file: d.file,
        line: d.line,
        column: d.column,
        message: d.message,
        severity: d.severity,
      })),
    },
  }));
}
