// ============================================================================
// CodeEX v2 — Extension Host Sandbox
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Sandboxed execution environment for user extensions. Provides a limited
// CodeEX Extension API surface (modeled after VS Code Extension API).
// Extensions run in isolated function scopes with controlled API access.
// Activation events: onStartupFinished, onLanguage:*, onCommand:*, onUri.
// ============================================================================

import type { ExtensionManifest } from "./types";

// ============================================================================
// Extension API Types (exposed to extensions)
// ============================================================================

export interface ExtensionContext {
  extensionId: string;
  extensionPath: string;
  subscriptions: Disposable[];
  globalState: ExtensionMemento;
  workspaceState: ExtensionMemento;
}

export interface Disposable {
  dispose(): void;
}

export interface ExtensionMemento {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: any): void;
  keys(): string[];
}

export interface OutputChannel {
  name: string;
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(): void;
  dispose(): void;
}

export interface StatusBarItem {
  text: string;
  tooltip: string;
  command?: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

// ============================================================================
// Activation Event Types
// ============================================================================

export type ActivationEvent =
  | "*"                           // Activate on startup
  | "onStartupFinished"           // Activate after startup sequence
  | `onLanguage:${string}`        // Activate when a file of this language is opened
  | `onCommand:${string}`         // Activate when this command is invoked
  | "onUri"                       // Activate on URI handling
  | `onFileSystem:${string}`      // Activate on file system scheme
  | "onDebug"                     // Activate when debugging starts
  | `onDebugResolve:${string}`    // Activate for debug config resolution
  | `onView:${string}`;           // Activate when a view is opened

// ============================================================================
// Extension Host State
// ============================================================================

interface HostedExtension {
  manifest: ExtensionManifest;
  context: ExtensionContext;
  activated: boolean;
  activatePromise?: Promise<void>;
  deactivateFn?: () => void | Promise<void>;
  exports: Record<string, any>;
}

const hostedExtensions = new Map<string, HostedExtension>();
const pendingActivationEvents = new Set<string>();
const commandHandlers = new Map<string, (...args: any[]) => any>();
const outputChannels = new Map<string, OutputChannel>();
const statusBarItems: StatusBarItem[] = [];
const taskProviders = new Map<string, { extensionId: string; provider: { provideTasks(): any[]; resolveTask?(task: any): any } }>();
const extensionStoragePrefix = "codex_ext_";

// ============================================================================
// Extension Memento (localStorage-backed key-value store per extension)
// ============================================================================

function createMemento(extensionId: string, scope: "global" | "workspace"): ExtensionMemento {
  const storageKey = `${extensionStoragePrefix}${scope}_${extensionId}`;

  function getData(): Record<string, any> {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveData(data: Record<string, any>): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
  }

  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const data = getData();
      return key in data ? data[key] : defaultValue;
    },
    update(key: string, value: any): void {
      const data = getData();
      if (value === undefined) {
        delete data[key];
      } else {
        data[key] = value;
      }
      saveData(data);
    },
    keys(): string[] {
      return Object.keys(getData());
    },
  };
}

// ============================================================================
// Sandboxed CodeEX Extension API
// ============================================================================

function createExtensionAPI(extensionId: string) {
  // --- commands namespace ---
  const commands = {
    registerCommand(commandId: string, handler: (...args: any[]) => any): Disposable {
      const fullId = commandId.includes(".") ? commandId : `${extensionId}.${commandId}`;
      commandHandlers.set(fullId, handler);

      document.dispatchEvent(new CustomEvent("codex:extension-command-registered", {
        detail: { commandId: fullId, extensionId },
      }));

      return {
        dispose() {
          commandHandlers.delete(fullId);
        },
      };
    },

    executeCommand(commandId: string, ...args: any[]): any {
      const handler = commandHandlers.get(commandId);
      if (handler) {
        return handler(...args);
      }
      // Dispatch as event for built-in command handling
      document.dispatchEvent(new CustomEvent("codex:execute-command", {
        detail: { commandId, args },
      }));
    },

    getCommands(): string[] {
      return [...commandHandlers.keys()];
    },
  };

  // --- window namespace ---
  const window = {
    showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
      emitHostLog(extensionId, message, "info");
      document.dispatchEvent(new CustomEvent("codex:extension-message", {
        detail: { extensionId, level: "info", message, items },
      }));
      // Return first item for simplicity (real implementation would show dialog)
      return Promise.resolve(items.length > 0 ? items[0] : undefined);
    },

    showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
      emitHostLog(extensionId, message, "warn");
      document.dispatchEvent(new CustomEvent("codex:extension-message", {
        detail: { extensionId, level: "warn", message, items },
      }));
      return Promise.resolve(items.length > 0 ? items[0] : undefined);
    },

    showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
      emitHostLog(extensionId, message, "error");
      document.dispatchEvent(new CustomEvent("codex:extension-message", {
        detail: { extensionId, level: "error", message, items },
      }));
      return Promise.resolve(items.length > 0 ? items[0] : undefined);
    },

    createOutputChannel(name: string): OutputChannel {
      const channel: OutputChannel = {
        name,
        append(value: string) {
          document.dispatchEvent(new CustomEvent("codex:output-log", {
            detail: { channel: name, level: "info", message: value },
          }));
        },
        appendLine(value: string) {
          document.dispatchEvent(new CustomEvent("codex:output-log", {
            detail: { channel: name, level: "info", message: value },
          }));
        },
        clear() {
          document.dispatchEvent(new CustomEvent("codex:output-clear", {
            detail: { channel: name },
          }));
        },
        show() {
          document.dispatchEvent(new CustomEvent("codex:show-output", {
            detail: { channel: name },
          }));
        },
        dispose() {
          outputChannels.delete(name);
        },
      };
      outputChannels.set(name, channel);
      return channel;
    },

    createStatusBarItem(): StatusBarItem {
      const item: StatusBarItem = {
        text: "",
        tooltip: "",
        command: undefined,
        show() {
          document.dispatchEvent(new CustomEvent("codex:statusbar-update", {
            detail: { extensionId, text: this.text, tooltip: this.tooltip, command: this.command, visible: true },
          }));
        },
        hide() {
          document.dispatchEvent(new CustomEvent("codex:statusbar-update", {
            detail: { extensionId, visible: false },
          }));
        },
        dispose() {
          this.hide();
          const idx = statusBarItems.indexOf(this);
          if (idx >= 0) statusBarItems.splice(idx, 1);
        },
      };
      statusBarItems.push(item);
      return item;
    },

    setStatusBarMessage(text: string, timeout?: number): Disposable {
      document.dispatchEvent(new CustomEvent("codex:statusbar-message", {
        detail: { text, timeout },
      }));
      return { dispose() {} };
    },
  };

  // --- workspace namespace ---
  const workspace = {
    getConfiguration(section?: string): {
      get<T>(key: string, defaultValue?: T): T | undefined;
      has(key: string): boolean;
    } {
      return {
        get<T>(key: string, defaultValue?: T): T | undefined {
          try {
            const raw = localStorage.getItem("codex_settings");
            if (!raw) return defaultValue;
            const settings = JSON.parse(raw);
            const fullKey = section ? `${section}.${key}` : key;
            return fullKey in settings ? settings[fullKey] : defaultValue;
          } catch {
            return defaultValue;
          }
        },
        has(key: string): boolean {
          try {
            const raw = localStorage.getItem("codex_settings");
            if (!raw) return false;
            const settings = JSON.parse(raw);
            const fullKey = section ? `${section}.${key}` : key;
            return fullKey in settings;
          } catch {
            return false;
          }
        },
      };
    },

    onDidChangeConfiguration(listener: () => void): Disposable {
      const handler = () => listener();
      document.addEventListener("codex:settings-changed", handler);
      return {
        dispose() {
          document.removeEventListener("codex:settings-changed", handler);
        },
      };
    },
  };

  // --- extensions namespace ---
  const extensions = {
    getExtension(id: string): { id: string; exports: Record<string, any> } | undefined {
      const hosted = hostedExtensions.get(id);
      if (!hosted) return undefined;
      return { id, exports: hosted.exports };
    },

    all: () => [...hostedExtensions.keys()],
  };

  // --- env namespace ---
  const env = {
    appName: "CodeEX",
    appRoot: "",
    language: navigator.language,
    machineId: "codex-local",
    sessionId: `session-${Date.now()}`,
  };

  // --- tasks namespace ---
  const tasks = {
    /** Register a task provider for a task type (e.g., "npm", "cargo"). */
    registerTaskProvider(taskType: string, provider: { provideTasks(): any[]; resolveTask?(task: any): any }): Disposable {
      taskProviders.set(taskType, { extensionId, provider });

      document.dispatchEvent(new CustomEvent("codex:task-provider-registered", {
        detail: { taskType, extensionId },
      }));

      return {
        dispose() {
          const entry = taskProviders.get(taskType);
          if (entry?.extensionId === extensionId) {
            taskProviders.delete(taskType);
          }
        },
      };
    },
  };

  return { commands, window, workspace, extensions, env, tasks };
}

// ============================================================================
// Extension Activation
// ============================================================================

export async function activateExtension(manifest: ExtensionManifest, code?: string): Promise<void> {
  if (hostedExtensions.has(manifest.id) && hostedExtensions.get(manifest.id)!.activated) {
    return; // Already activated
  }

  const context: ExtensionContext = {
    extensionId: manifest.id,
    extensionPath: manifest.main === "built-in" ? "" : manifest.main,
    subscriptions: [],
    globalState: createMemento(manifest.id, "global"),
    workspaceState: createMemento(manifest.id, "workspace"),
  };

  const hosted: HostedExtension = {
    manifest,
    context,
    activated: false,
    exports: {},
  };

  hostedExtensions.set(manifest.id, hosted);

  // Built-in extensions don't need sandbox execution
  if (manifest.main === "built-in") {
    hosted.activated = true;
    emitHostLog(manifest.id, `Built-in extension activated: ${manifest.name}`, "info");
    return;
  }

  // User extensions: execute in sandboxed function scope
  if (code) {
    const activatePromise = runExtensionInSandbox(manifest.id, code, context);
    hosted.activatePromise = activatePromise;

    try {
      await activatePromise;
      hosted.activated = true;
      emitHostLog(manifest.id, `Extension activated: ${manifest.name} v${manifest.version}`, "info");

      document.dispatchEvent(new CustomEvent("codex:extension-activated", {
        detail: { extensionId: manifest.id, name: manifest.name },
      }));
    } catch (err: any) {
      emitHostLog(manifest.id, `Extension activation failed: ${manifest.name} — ${err.message}`, "error");

      document.dispatchEvent(new CustomEvent("codex:extension-activation-error", {
        detail: { extensionId: manifest.id, error: err.message },
      }));
    }
  }
}

async function runExtensionInSandbox(
  extensionId: string,
  code: string,
  context: ExtensionContext,
): Promise<void> {
  const api = createExtensionAPI(extensionId);
  const hosted = hostedExtensions.get(extensionId)!;

  try {
    // Create sandboxed function scope
    // The extension code should export activate(context) and optionally deactivate()
    const sandboxFn = new Function(
      "codex",       // The CodeEX Extension API (equivalent to VS Code's `vscode`)
      "context",     // ExtensionContext
      "exports",     // Module exports object
      `"use strict";
      ${code}
      if (typeof activate === "function") {
        return activate(context);
      }`,
    );

    const extensionExports: Record<string, any> = {};
    const result = sandboxFn(api, context, extensionExports);

    // Wait for async activate if it returns a promise
    if (result && typeof result.then === "function") {
      await result;
    }

    hosted.exports = extensionExports;

    // Check if a deactivate function was defined
    try {
      const deactivateCheck = new Function(
        "codex", "context", "exports",
        `"use strict";
        ${code}
        if (typeof deactivate === "function") {
          return deactivate;
        }
        return undefined;`,
      );
      const deactivateFn = deactivateCheck(api, context, extensionExports);
      if (typeof deactivateFn === "function") {
        hosted.deactivateFn = deactivateFn;
      }
    } catch {}
  } catch (err: any) {
    throw new Error(`Sandbox error in ${extensionId}: ${err.message}`);
  }
}

// ============================================================================
// Extension Deactivation
// ============================================================================

export async function deactivateExtension(extensionId: string): Promise<void> {
  const hosted = hostedExtensions.get(extensionId);
  if (!hosted || !hosted.activated) return;

  // Run deactivate function if provided
  if (hosted.deactivateFn) {
    try {
      const result = hosted.deactivateFn();
      if (result && typeof (result as any).then === "function") {
        await result;
      }
    } catch (err: any) {
      emitHostLog(extensionId, `Deactivation error: ${err.message}`, "error");
    }
  }

  // Dispose all subscriptions
  for (const sub of hosted.context.subscriptions) {
    try {
      sub.dispose();
    } catch {}
  }

  // Unregister commands from this extension
  for (const [cmdId, _handler] of commandHandlers) {
    if (cmdId.startsWith(`${extensionId}.`)) {
      commandHandlers.delete(cmdId);
    }
  }

  hosted.activated = false;
  hostedExtensions.delete(extensionId);

  emitHostLog(extensionId, `Extension deactivated: ${hosted.manifest.name}`, "info");

  document.dispatchEvent(new CustomEvent("codex:extension-deactivated", {
    detail: { extensionId },
  }));
}

// ============================================================================
// Activation Event Matching
// ============================================================================

export function fireActivationEvent(event: string): void {
  if (pendingActivationEvents.has(event)) return;
  pendingActivationEvents.add(event);

  document.dispatchEvent(new CustomEvent("codex:activation-event", {
    detail: { event },
  }));
}

export function matchesActivationEvent(manifest: ExtensionManifest, event: string): boolean {
  if (!manifest.activationEvents || manifest.activationEvents.length === 0) {
    return false;
  }

  for (const ae of manifest.activationEvents) {
    if (ae === "*") return true;
    if (ae === event) return true;

    // Pattern matching for parameterized events
    if (ae.startsWith("onLanguage:") && event.startsWith("onLanguage:")) {
      const aeLanguage = ae.slice("onLanguage:".length);
      const eventLanguage = event.slice("onLanguage:".length);
      if (aeLanguage === eventLanguage) return true;
    }

    if (ae.startsWith("onCommand:") && event.startsWith("onCommand:")) {
      const aeCommand = ae.slice("onCommand:".length);
      const eventCommand = event.slice("onCommand:".length);
      if (aeCommand === eventCommand) return true;
    }

    if (ae.startsWith("onView:") && event.startsWith("onView:")) {
      const aeView = ae.slice("onView:".length);
      const eventView = event.slice("onView:".length);
      if (aeView === eventView) return true;
    }
  }

  return false;
}

// ============================================================================
// Extension Host Queries
// ============================================================================

export function getHostedExtension(id: string): HostedExtension | undefined {
  return hostedExtensions.get(id);
}

export function getActivatedExtensions(): string[] {
  const result: string[] = [];
  for (const [id, hosted] of hostedExtensions) {
    if (hosted.activated) result.push(id);
  }
  return result;
}

export function getHostedExtensionCount(): number {
  return hostedExtensions.size;
}

export function isExtensionActivated(id: string): boolean {
  return hostedExtensions.get(id)?.activated ?? false;
}

export function executeExtensionCommand(commandId: string, ...args: any[]): any {
  const handler = commandHandlers.get(commandId);
  if (handler) {
    return handler(...args);
  }
  return undefined;
}

export function getExtensionCommandIds(): string[] {
  return [...commandHandlers.keys()];
}

// ============================================================================
// Extension Host Lifecycle
// ============================================================================

export function disposeAllExtensions(): void {
  const ids = [...hostedExtensions.keys()];
  for (const id of ids) {
    deactivateExtension(id);
  }
  commandHandlers.clear();
  outputChannels.clear();
  statusBarItems.length = 0;
  taskProviders.clear();
  pendingActivationEvents.clear();
}

// ============================================================================
// Task Provider API
// ============================================================================

/** Get all registered task providers. */
export function getTaskProviders(): Map<string, { extensionId: string; provider: { provideTasks(): any[]; resolveTask?(task: any): any } }> {
  return new Map(taskProviders);
}

/** Collect tasks from all registered task providers. */
export function collectExtensionTasks(): any[] {
  const allTasks: any[] = [];
  for (const [taskType, entry] of taskProviders) {
    try {
      const tasks = entry.provider.provideTasks();
      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          allTasks.push({ ...t, type: t.type ?? taskType, isExtensionProvided: true, extensionId: entry.extensionId });
        }
      }
    } catch (err: any) {
      emitHostLog(entry.extensionId, `Task provider error (${taskType}): ${err.message}`, "error");
    }
  }
  return allTasks;
}

// ============================================================================
// Helpers
// ============================================================================

function emitHostLog(extensionId: string, message: string, level: "info" | "warn" | "error" | "debug"): void {
  document.dispatchEvent(new CustomEvent("codex:output-log", {
    detail: { channel: "Extensions", level, message: `[${extensionId}] ${message}` },
  }));
}
