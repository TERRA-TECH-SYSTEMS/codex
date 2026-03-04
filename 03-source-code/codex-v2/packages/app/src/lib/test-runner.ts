// ============================================================================
// CodeEX v2 — Test Runner
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Test discovery and execution via TerraRuntime run_command.
// Supports Vitest, Jest, and Mocha with JSON output parsing.
// ============================================================================

import { createSignal } from "solid-js";

export type TestStatus = "idle" | "running" | "passed" | "failed" | "skipped" | "error";
export type TestRunner = "vitest" | "jest" | "mocha";

export interface TestFile {
  path: string;
  name: string;
  status: TestStatus;
  tests: TestCase[];
}

export interface TestCase {
  id: string;
  name: string;
  line?: number;
  status: TestStatus;
  duration?: number;
  message?: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

// ── State ──

const [testFiles, setTestFiles] = createSignal<TestFile[]>([]);
const [isRunning, setIsRunning] = createSignal(false);
const [selectedRunner, setSelectedRunner] = createSignal<TestRunner>("vitest");
const [lastSummary, setLastSummary] = createSignal<TestSummary | null>(null);
const [testError, setTestError] = createSignal("");

export { testFiles, isRunning, selectedRunner, lastSummary, testError };

export function setRunner(runner: TestRunner): void {
  setSelectedRunner(runner);
}

// ── TerraRuntime Helpers ──

function hasTerraRuntime(): boolean {
  return !!(window as any).__TAURI__?.core?.invoke;
}

async function runCommand(command: string, timeout = 60_000): Promise<string> {
  const tr = (window as any).__TAURI__;
  if (!tr?.core?.invoke) throw new Error("TerraRuntime not available");
  return Promise.race([
    tr.core.invoke("run_command", { command }) as Promise<string>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Test command timed out after ${timeout / 1000}s`)), timeout)
    ),
  ]);
}

// ── Test Discovery ──

export async function discoverTests(): Promise<void> {
  if (!hasTerraRuntime()) return;
  setTestError("");

  try {
    // Use find to locate test files, excluding node_modules
    const output = await runCommand(
      "find . -path ./node_modules -prune -o \\( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' -o -name '*.test.jsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.js' -o -name '*.spec.jsx' \\) -type f -print"
    );

    const files = output.trim().split("\n").filter(Boolean).map(f => f.trim());
    const discovered: TestFile[] = files.map(path => ({
      path,
      name: path.split("/").pop() || path,
      status: "idle" as TestStatus,
      tests: [],
    }));

    // Sort by name
    discovered.sort((a, b) => a.name.localeCompare(b.name));
    setTestFiles(discovered);

    document.dispatchEvent(new CustomEvent("codex:tests-discovered", {
      detail: { count: discovered.length },
    }));
  } catch (err: any) {
    setTestError(err.message || "Test discovery failed");
  }
}

// ── Test Execution ──

function getRunCommand(runner: TestRunner, files?: string[]): string {
  const fileArgs = files?.join(" ") || "";
  switch (runner) {
    case "vitest":
      return `npx vitest run ${fileArgs} --reporter=json 2>/dev/null`;
    case "jest":
      return `npx jest ${fileArgs} --json --no-coverage 2>/dev/null`;
    case "mocha":
      return `npx mocha ${fileArgs} --reporter=json 2>/dev/null`;
  }
}

export async function runAllTests(): Promise<void> {
  if (!hasTerraRuntime() || isRunning()) return;
  setIsRunning(true);
  setTestError("");

  // Mark all files as running
  setTestFiles(prev => prev.map(f => ({ ...f, status: "running" as TestStatus, tests: [] })));

  try {
    const output = await runCommand(getRunCommand(selectedRunner()), 120_000);
    const results = parseTestOutput(output, selectedRunner());
    applyResults(results);

    document.dispatchEvent(new CustomEvent("codex:test-results", {
      detail: { summary: lastSummary() },
    }));
  } catch (err: any) {
    setTestError(err.message || "Test execution failed");
    setTestFiles(prev => prev.map(f => ({ ...f, status: "error" as TestStatus })));
  } finally {
    setIsRunning(false);
  }
}

export async function runTestFile(filePath: string): Promise<void> {
  if (!hasTerraRuntime() || isRunning()) return;
  setIsRunning(true);
  setTestError("");

  // Mark target file as running
  setTestFiles(prev => prev.map(f =>
    f.path === filePath ? { ...f, status: "running" as TestStatus, tests: [] } : f
  ));

  try {
    const output = await runCommand(getRunCommand(selectedRunner(), [filePath]), 60_000);
    const results = parseTestOutput(output, selectedRunner());
    applyResults(results);
  } catch (err: any) {
    setTestError(err.message || "Test execution failed");
    setTestFiles(prev => prev.map(f =>
      f.path === filePath ? { ...f, status: "error" as TestStatus } : f
    ));
  } finally {
    setIsRunning(false);
  }
}

// ── Output Parsing ──

interface ParsedTest {
  file: string;
  name: string;
  status: TestStatus;
  duration: number;
  message?: string;
}

function parseTestOutput(output: string, runner: TestRunner): ParsedTest[] {
  const results: ParsedTest[] = [];

  try {
    // Extract JSON from output (may have non-JSON prefix)
    const jsonStart = output.indexOf("{");
    if (jsonStart < 0) return results;
    const json = JSON.parse(output.slice(jsonStart));

    if (runner === "vitest") {
      parseVitestOutput(json, results);
    } else if (runner === "jest") {
      parseJestOutput(json, results);
    } else if (runner === "mocha") {
      parseMochaOutput(json, results);
    }
  } catch {
    // Fallback: try to parse line-by-line for pass/fail patterns
    parseFallbackOutput(output, results);
  }

  return results;
}

function parseVitestOutput(json: any, results: ParsedTest[]): void {
  const testResults = json.testResults || [];
  for (const tr of testResults) {
    const file = tr.name || "";
    const assertions = tr.assertionResults || [];
    for (const ar of assertions) {
      results.push({
        file,
        name: ar.fullName || ar.title || "unknown",
        status: mapStatus(ar.status),
        duration: ar.duration || 0,
        message: ar.failureMessages?.[0],
      });
    }
  }
}

function parseJestOutput(json: any, results: ParsedTest[]): void {
  const testResults = json.testResults || [];
  for (const tr of testResults) {
    const file = tr.name || tr.testFilePath || "";
    const assertions = tr.assertionResults || tr.testResults || [];
    for (const ar of assertions) {
      results.push({
        file,
        name: ar.fullName || ar.title || "unknown",
        status: mapStatus(ar.status),
        duration: ar.duration || 0,
        message: ar.failureMessages?.[0],
      });
    }
  }
}

function parseMochaOutput(json: any, results: ParsedTest[]): void {
  const passes = json.passes || [];
  const failures = json.failures || [];
  const pending = json.pending || [];

  for (const t of passes) {
    results.push({ file: t.file || "", name: t.fullTitle || t.title, status: "passed", duration: t.duration || 0 });
  }
  for (const t of failures) {
    results.push({ file: t.file || "", name: t.fullTitle || t.title, status: "failed", duration: t.duration || 0, message: t.err?.message });
  }
  for (const t of pending) {
    results.push({ file: t.file || "", name: t.fullTitle || t.title, status: "skipped", duration: 0 });
  }
}

function parseFallbackOutput(output: string, results: ParsedTest[]): void {
  const lines = output.split("\n");
  for (const line of lines) {
    const passMatch = line.match(/✓|PASS|pass/);
    const failMatch = line.match(/✕|✗|FAIL|fail/);
    if (passMatch || failMatch) {
      results.push({
        file: "",
        name: line.trim().replace(/^[✓✕✗]\s*/, "").replace(/^\(?\d+ms\)?\s*/, ""),
        status: failMatch ? "failed" : "passed",
        duration: 0,
      });
    }
  }
}

function mapStatus(s: string): TestStatus {
  switch (s) {
    case "passed": return "passed";
    case "failed": return "failed";
    case "pending":
    case "skipped":
    case "todo":
      return "skipped";
    default: return "idle";
  }
}

// ── Apply Results ──

function applyResults(results: ParsedTest[]): void {
  const fileMap = new Map<string, TestCase[]>();

  for (const r of results) {
    // Normalize file path
    const key = r.file || "unknown";
    if (!fileMap.has(key)) fileMap.set(key, []);
    fileMap.get(key)!.push({
      id: `${key}:${r.name}`,
      name: r.name,
      status: r.status,
      duration: r.duration,
      message: r.message,
    });
  }

  setTestFiles(prev => {
    const updated = prev.map(f => {
      // Match by path suffix
      const matchKey = [...fileMap.keys()].find(k =>
        k.endsWith(f.path.replace("./", "")) || f.path.endsWith(k.split("/").pop() || "")
      );

      if (matchKey) {
        const cases = fileMap.get(matchKey)!;
        const hasFailed = cases.some(c => c.status === "failed" || c.status === "error");
        const allPassed = cases.every(c => c.status === "passed" || c.status === "skipped");
        return {
          ...f,
          status: (hasFailed ? "failed" : allPassed ? "passed" : "idle") as TestStatus,
          tests: cases,
        };
      }
      return f;
    });
    return updated;
  });

  // Compute summary
  const allTests = results;
  const summary: TestSummary = {
    total: allTests.length,
    passed: allTests.filter(t => t.status === "passed").length,
    failed: allTests.filter(t => t.status === "failed").length,
    skipped: allTests.filter(t => t.status === "skipped").length,
    duration: allTests.reduce((sum, t) => sum + t.duration, 0),
  };
  setLastSummary(summary);
}

// ── Helpers ──

export function getStatusIcon(status: TestStatus): string {
  switch (status) {
    case "passed": return "\u2713";
    case "failed": return "\u2715";
    case "skipped": return "\u2298";
    case "running": return "\u25D0";
    case "error": return "!";
    default: return "\u25CB";
  }
}

export function getFileStats(file: TestFile): string {
  if (file.tests.length === 0) return "";
  const passed = file.tests.filter(t => t.status === "passed").length;
  return `${passed}/${file.tests.length}`;
}
