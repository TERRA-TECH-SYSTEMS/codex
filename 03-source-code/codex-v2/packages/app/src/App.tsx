// ============================================================================
// CodeEX v2 — Main Application Shell
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Layout: ActivityBar | Sidebar | ResizeHandle | Editor+Terminal | ResizeHandle | ChatPanel
//         StatusBar (bottom)
// ============================================================================

import { createSignal, Show } from "solid-js";
import { ActivityBar } from "./components/ActivityBar";
import { Sidebar } from "./components/Sidebar";
import { EditorArea } from "./components/EditorArea";
import { ChatPanel } from "./components/ChatPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { ProblemsPanel } from "./components/ProblemsPanel";
import { OutputPanel } from "./components/OutputPanel";
import { GoToSymbol } from "./components/GoToSymbol";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { TitleBar } from "./components/TitleBar";
import { ResizeHandle } from "./components/ResizeHandle";
import { SettingsPanel } from "./components/SettingsPanel";
import { NotificationToast } from "./components/NotificationToast";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { DiffViewer } from "./components/DiffViewer";
import { DebugPanel } from "./components/DebugPanel";
import { GoToLine } from "./components/GoToLine";
import { LoginPage } from "./components/LoginPage";
import { QuickOpen } from "./components/QuickOpen";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { notify } from "./lib/notifications";
import { initAuth, processLogin, logout, authStatus } from "./lib/auth-store";
import { getLspClient, uriToPath } from "./lib/lsp-client";
import { startDebugSession, stopDebugSession, continueExecution, stepOver, stepInto, stepOut, toggleBreakpoint, getDebugStatus, setDebugWorkspaceRoot, setDebugActiveFile } from "./lib/debug-client";
import { loadLaunchConfigs } from "./lib/debug-config";
import { toggleBlameEnabled } from "./lib/git-blame";
import { loadWorkspaceSettings, syncFromFile, exportSettingsAsJSON } from "./lib/settings-store";
import { fireActivationEvent } from "./lib/extension-registry";
import { discoverTests, runAllTests } from "./lib/test-runner";
import { discoverTasks, runBuildTask, runTask, setTaskWorkspaceRoot } from "./lib/task-runner";
import { loadUserSnippets } from "./lib/user-snippets";
import "./lib/theme"; // Initialize theme on load
import type { PanelView, BottomTab } from "./lib/types";

export function App() {
  // Authentication gate — uses auth store for full user lifecycle
  const [authenticated, setAuthenticated] = createSignal(initAuth());

  // Listen for logout / session expired / sign out events
  window.addEventListener("codex:logout", () => setAuthenticated(false));
  window.addEventListener("codex:session-expired", () => {
    notify("Session expired. Please sign in again.", "warning", 5000);
    setAuthenticated(false);
  });
  window.addEventListener("codex:sign-out", () => {
    logout({ redirectToLogin: true });
  });

  const handleLogin = () => {
    processLogin();
    setAuthenticated(true);
  };

  const [activePanel, setActivePanel] = createSignal<PanelView>("files");
  const [sidebarVisible, setSidebarVisible] = createSignal(true);
  const [chatVisible, setChatVisible] = createSignal(true);
  const [terminalVisible, setTerminalVisible] = createSignal(false);
  const [bottomTab, setBottomTab] = createSignal<BottomTab>("terminal");
  const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = createSignal(false);
  const [diffState, setDiffState] = createSignal<{
    fileName: string; oldContent: string; newContent: string;
    onAccept?: () => void; onReject?: () => void;
  } | null>(null);
  const [openFiles, setOpenFiles] = createSignal<string[]>([]);
  const [activeFile, setActiveFile] = createSignal<string | null>(null);
  const [goToLineOpen, setGoToLineOpen] = createSignal(false);
  const [goToSymbolOpen, setGoToSymbolOpen] = createSignal(false);
  const [goToSymbolList, setGoToSymbolList] = createSignal<{ name: string; kind: string; line: number; icon: string; color: string }[]>([]);
  const [quickOpenVisible, setQuickOpenVisible] = createSignal(false);
  const [cursorLine, setCursorLine] = createSignal(1);
  const [editorMaxLine, setEditorMaxLine] = createSignal(1);

  // ── Split Editor Groups ──────────────────────────────────────────────
  // Each group has its own open files and active file. Group 0 is the primary.
  interface EditorGroup {
    id: number;
    openFiles: string[];
    activeFile: string | null;
  }
  let nextGroupId = 1;
  const [editorGroups, setEditorGroups] = createSignal<EditorGroup[]>([
    { id: 0, openFiles: [], activeFile: null },
  ]);
  const [activeGroupId, setActiveGroupId] = createSignal(0);

  // Sync primary group with the legacy openFiles/activeFile signals
  createEffect(() => {
    const groups = editorGroups();
    const primary = groups[0];
    if (primary) {
      setOpenFiles(primary.openFiles);
      setActiveFile(primary.activeFile);
    }
  });

  /** Update a specific editor group. */
  const updateGroup = (groupId: number, updater: (g: EditorGroup) => EditorGroup) => {
    setEditorGroups((prev) => prev.map((g) => g.id === groupId ? updater(g) : g));
  };

  /** Split the active file into a new editor group. */
  const splitEditor = () => {
    const file = activeFile();
    if (!file) return;
    const newId = nextGroupId++;
    setEditorGroups((prev) => [
      ...prev,
      { id: newId, openFiles: [file], activeFile: file },
    ]);
    setActiveGroupId(newId);
  };

  /** Close an editor group (cannot close last group). */
  const closeGroup = (groupId: number) => {
    const groups = editorGroups();
    if (groups.length <= 1) return;
    setEditorGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (activeGroupId() === groupId) {
      const remaining = editorGroups();
      setActiveGroupId(remaining[0]?.id ?? 0);
    }
  };

  // Recently closed tab stack for Ctrl+Shift+T undo
  const closedTabs: string[] = [];

  // Panel widths (resizable)
  const [sidebarWidth, setSidebarWidth] = createSignal(260);
  const [chatWidth, setChatWidth] = createSignal(360);
  const [terminalHeight, setTerminalHeight] = createSignal(240);

  // Global keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Shift+P — Command Palette
    if (e.ctrlKey && e.shiftKey && e.key === "P") {
      e.preventDefault();
      setCommandPaletteOpen((v) => !v);
    }
    // Ctrl+P — Quick Open file picker
    if (e.ctrlKey && !e.shiftKey && e.key === "p") {
      e.preventDefault();
      setQuickOpenVisible((v) => !v);
    }
    // Ctrl+B — Toggle Sidebar
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      setSidebarVisible((v) => !v);
    }
    // Ctrl+Escape — Focus Chat
    if (e.ctrlKey && e.key === "Escape") {
      e.preventDefault();
      setChatVisible(true);
    }
    // Ctrl+` — Toggle Terminal
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      setTerminalVisible((v) => !v);
    }
    // Ctrl+, — Settings
    if (e.ctrlKey && e.key === ",") {
      e.preventDefault();
      setSettingsOpen((v) => !v);
    }
    // Ctrl+Shift+/ — Keyboard Shortcuts Help
    if (e.ctrlKey && e.shiftKey && e.key === "?") {
      e.preventDefault();
      setKeyboardHelpOpen((v) => !v);
    }
    // Ctrl+N — New untitled file
    if (e.ctrlKey && !e.shiftKey && e.key === "n") {
      e.preventDefault();
      let n = 1;
      while (openFiles().includes(`Untitled-${n}`)) n++;
      openFile(`Untitled-${n}`);
    }
    // Ctrl+Shift+E — Focus File Explorer
    if (e.ctrlKey && e.shiftKey && e.key === "E") {
      e.preventDefault();
      setSidebarVisible(true);
      setActivePanel("files");
    }
    // Ctrl+Shift+G — Focus Source Control
    if (e.ctrlKey && e.shiftKey && e.key === "G") {
      e.preventDefault();
      setSidebarVisible(true);
      setActivePanel("git");
    }
    // Ctrl+W — Close active tab
    if (e.ctrlKey && e.key === "w") {
      e.preventDefault();
      const current = activeFile();
      if (current) closeFile(current);
    }
    // Ctrl+S — Save active file
    if (e.ctrlKey && !e.shiftKey && e.key === "s") {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("codex:save-file"));
    }
    // Ctrl+G — Go to Line
    if (e.ctrlKey && !e.shiftKey && e.key === "g") {
      e.preventDefault();
      if (activeFile()) setGoToLineOpen(true);
    }
    // Ctrl+Shift+C — Copy active file path
    if (e.ctrlKey && e.shiftKey && e.key === "C") {
      e.preventDefault();
      const current = activeFile();
      if (current) {
        navigator.clipboard.writeText(current);
        notify("Path copied", "info", 1500);
      }
    }
    // Ctrl+Shift+O — Go to Symbol
    if (e.ctrlKey && e.shiftKey && e.key === "O") {
      e.preventDefault();
      if (activeFile()) {
        document.dispatchEvent(new CustomEvent("codex:request-symbols"));
        setGoToSymbolOpen(true);
      }
    }
    // Ctrl+Shift+T — Reopen closed tab
    if (e.ctrlKey && e.shiftKey && e.key === "T") {
      e.preventDefault();
      const last = closedTabs.pop();
      if (last) openFile(last);
    }
    // Ctrl+\ — Split Editor
    if (e.ctrlKey && e.key === "\\") {
      e.preventDefault();
      splitEditor();
    }
    // Ctrl+= / Ctrl+- / Ctrl+0 — Zoom
    if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      const current = parseFloat(document.documentElement.style.getPropertyValue("--app-zoom") || "1");
      const next = Math.min(current + 0.1, 2);
      document.documentElement.style.setProperty("--app-zoom", String(next));
      notify(`Zoom: ${Math.round(next * 100)}%`, "info", 1500);
    }
    if (e.ctrlKey && e.key === "-") {
      e.preventDefault();
      const current = parseFloat(document.documentElement.style.getPropertyValue("--app-zoom") || "1");
      const next = Math.max(current - 0.1, 0.6);
      document.documentElement.style.setProperty("--app-zoom", String(next));
      notify(`Zoom: ${Math.round(next * 100)}%`, "info", 1500);
    }
    if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      document.documentElement.style.setProperty("--app-zoom", "1");
      notify("Zoom: 100%", "info", 1500);
    }
    // Ctrl+Tab — Next Tab, Ctrl+Shift+Tab — Previous Tab
    if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      const files = openFiles();
      if (files.length < 2) return;
      const idx = files.indexOf(activeFile() ?? "");
      if (e.shiftKey) {
        setActiveFile(files[(idx - 1 + files.length) % files.length]);
      } else {
        setActiveFile(files[(idx + 1) % files.length]);
      }
    }
    // Ctrl+J — Toggle Bottom Panel
    if (e.ctrlKey && !e.shiftKey && e.key === "j") {
      e.preventDefault();
      setTerminalVisible((v) => !v);
    }
    // Ctrl+Shift+M — Toggle Problems Panel
    if (e.ctrlKey && e.shiftKey && e.key === "M") {
      e.preventDefault();
      if (terminalVisible() && bottomTab() === "problems") {
        setTerminalVisible(false);
      } else {
        setTerminalVisible(true);
        setBottomTab("problems");
      }
    }
    // Ctrl+Shift+U — Toggle Output Panel
    if (e.ctrlKey && e.shiftKey && e.key === "U") {
      e.preventDefault();
      if (terminalVisible() && bottomTab() === "output") {
        setTerminalVisible(false);
      } else {
        setTerminalVisible(true);
        setBottomTab("output");
      }
    }
    // Ctrl+Shift+F — Focus Search in Files
    if (e.ctrlKey && e.shiftKey && e.key === "F") {
      e.preventDefault();
      setSidebarVisible(true);
      setActivePanel("search");
      setTimeout(() => {
        const el = document.querySelector(".search-input") as HTMLInputElement;
        if (el) el.focus();
      }, 50);
    }
    // Ctrl+Shift+H — Find and Replace in Files
    if (e.ctrlKey && e.shiftKey && e.key === "H") {
      e.preventDefault();
      setSidebarVisible(true);
      setActivePanel("search");
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("codex:toggle-replace"));
        const el = document.querySelector(".search-input") as HTMLInputElement;
        if (el) el.focus();
      }, 50);
    }
    // F5 — Start/Continue Debug
    if (e.key === "F5" && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const dbgStatus = getDebugStatus();
      if (dbgStatus === "idle" || dbgStatus === "stopped") {
        startDebugSession();
        setTerminalVisible(true);
        setBottomTab("debug");
      } else if (dbgStatus === "paused") {
        continueExecution();
      }
    }
    // Shift+F5 — Stop Debug
    if (e.key === "F5" && e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      stopDebugSession();
    }
    // F9 — Toggle Breakpoint
    if (e.key === "F9" && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const file = activeFile();
      if (file) {
        toggleBreakpoint(file, cursorLine());
      }
    }
    // F10 — Step Over
    if (e.key === "F10" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      stepOver();
    }
    // F11 — Step Into
    if (e.key === "F11" && !e.shiftKey) {
      e.preventDefault();
      stepInto();
    }
    // Shift+F11 — Step Out
    if (e.key === "F11" && e.shiftKey) {
      e.preventDefault();
      stepOut();
    }
    // Ctrl+Shift+B — Run Build Task
    if (e.ctrlKey && e.shiftKey && e.key === "B") {
      e.preventDefault();
      runBuildTask();
      setTerminalVisible(true);
      setBottomTab("output");
    }
    // Ctrl+Shift+D — Toggle Debug Panel
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault();
      if (terminalVisible() && bottomTab() === "debug") {
        setTerminalVisible(false);
      } else {
        setTerminalVisible(true);
        setBottomTab("debug");
      }
    }
    // Escape — Close overlays
    if (e.key === "Escape") {
      setCommandPaletteOpen(false);
      setSettingsOpen(false);
      setKeyboardHelpOpen(false);
      setGoToLineOpen(false);
      setGoToSymbolOpen(false);
      setQuickOpenVisible(false);
    }
  };

  document.addEventListener("keydown", handleKeyDown);

  // Custom events from CommandPalette and other components
  document.addEventListener("codex:toggle-terminal", () => setTerminalVisible((v) => !v));
  document.addEventListener("codex:toggle-sidebar", () => setSidebarVisible((v) => !v));
  document.addEventListener("codex:toggle-chat", () => setChatVisible((v) => !v));
  document.addEventListener("codex:open-settings", () => setSettingsOpen(true));
  document.addEventListener("codex:keyboard-help", () => setKeyboardHelpOpen(true));
  document.addEventListener("codex:toggle-blame", () => toggleBlameEnabled());
  document.addEventListener("codex:run-all-tests", () => runAllTests());
  document.addEventListener("codex:discover-tests", () => discoverTests());
  document.addEventListener("codex:run-build-task", () => runBuildTask());
  document.addEventListener("codex:run-task", ((e: Event) => runTask((e as any).detail?.label)) as EventListener);
  document.addEventListener("codex:discover-tasks", () => discoverTasks());
  document.addEventListener("codex:sync-export", () => {
    const json = exportSettingsAsJSON();
    navigator.clipboard.writeText(json).catch(() => {});
  });
  document.addEventListener("codex:sync-import", () => syncFromFile());
  document.addEventListener("codex:show-diff", ((e: CustomEvent) => {
    setDiffState(e.detail ?? null);
  }) as EventListener);
  document.addEventListener("codex:cursor-update", ((e: CustomEvent<{ line: number; col: number }>) => {
    setCursorLine(e.detail.line);
  }) as EventListener);
  document.addEventListener("codex:editor-info", ((e: CustomEvent<{ maxLine: number }>) => {
    setEditorMaxLine(e.detail.maxLine);
  }) as EventListener);
  document.addEventListener("codex:symbols-response", ((e: CustomEvent<{ symbols: { name: string; kind: string; line: number; icon: string; color: string }[] }>) => {
    setGoToSymbolList(e.detail.symbols);
  }) as EventListener);

  // LSP — Go to Definition handler (triggered by F12 in editor)
  document.addEventListener("codex:goto-definition", ((e: CustomEvent<{ path: string; line: number; character: number }>) => {
    const targetPath = e.detail.path.replace(/\\/g, "/");
    openFile(targetPath);
    // Jump to line after a brief delay to allow editor to mount
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line: e.detail.line } }));
    }, 100);
  }) as EventListener);

  // LSP — Find All References handler (Shift+F12)
  document.addEventListener("codex:show-references", ((e: CustomEvent<{ references: Array<{ path: string; line: number; character: number }> }>) => {
    const refs = e.detail.references;
    if (refs.length === 1) {
      const ref = refs[0];
      openFile(ref.path.replace(/\\/g, "/"));
      setTimeout(() => document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line: ref.line } })), 100);
    } else if (refs.length > 1) {
      // Show references in Output panel
      for (const ref of refs) {
        const fileName = ref.path.split("/").pop() ?? ref.path;
        document.dispatchEvent(new CustomEvent("codex:output-log", {
          detail: { channel: "References", level: "info", message: `${fileName}:${ref.line}:${ref.character} — ${ref.path}` },
        }));
      }
      setTerminalVisible(true);
      setBottomTab("output");
      const first = refs[0];
      openFile(first.path.replace(/\\/g, "/"));
      setTimeout(() => document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line: first.line } })), 100);
    }
  }) as EventListener);

  // LSP — Initialize on mount (desktop only, auto-detect workspace root)
  // Attempts to start TypeScript language server for the opened workspace
  const initLsp = async () => {
    try {
      const tr = (window as any).__TAURI__;
      if (!tr?.core?.invoke) return; // Web mode — no LSP
      // Detect workspace root from the filesystem backend
      const cwd: string = await tr.core.invoke("run_command", { command: "cd" });
      const root = cwd.trim().replace(/\\/g, "/");
      if (root) {
        getLspClient().start(root);
        loadWorkspaceSettings(root);
        loadUserSnippets(root);
        setDebugWorkspaceRoot(root);
        loadLaunchConfigs(root);
        setTaskWorkspaceRoot(root);
        discoverTasks();
      }
    } catch {
      // LSP init is best-effort — don't block the app
    }
  };
  initLsp();

  // LSP — Forward diagnostics from LSP notifications to editor + problems panel
  getLspClient().onNotification("textDocument/publishDiagnostics", (params: any) => {
    // Forward to editor (per-file squiggles)
    document.dispatchEvent(new CustomEvent("codex:lsp-diagnostics", {
      detail: { uri: params.uri, diagnostics: params.diagnostics ?? [] },
    }));
    // Forward to Problems panel (global diagnostic list)
    const filePath = uriToPath(params.uri);
    const diagnostics = (params.diagnostics ?? []).map((d: any) => ({
      file: filePath,
      line: (d.range?.start?.line ?? 0) + 1,
      col: (d.range?.start?.character ?? 0) + 1,
      severity: d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info",
      message: d.message ?? "",
      source: d.source ?? "LSP",
    }));
    document.dispatchEvent(new CustomEvent("codex:set-diagnostics", {
      detail: { file: filePath, diagnostics },
    }));
  });

  /** Open a file in the active editor group (or specific group). */
  const openFile = (path: string, targetGroupId?: number) => {
    const gid = targetGroupId ?? activeGroupId();
    updateGroup(gid, (g) => ({
      ...g,
      openFiles: g.openFiles.includes(path) ? g.openFiles : [...g.openFiles, path],
      activeFile: path,
    }));
    // Also update legacy signals for backwards compat (status bar, etc.)
    if (!openFiles().includes(path)) setOpenFiles((prev) => [...prev, path]);
    setActiveFile(path);
    setActiveGroupId(gid);
    setDebugActiveFile(path);

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const langMap: Record<string, string> = { ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact", py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp", json: "json", md: "markdown", html: "html", css: "css" };
    const lang = langMap[ext];
    if (lang) fireActivationEvent(`onLanguage:${lang}`);
  };

  /** Close a file in the active group (or specific group). */
  const closeFile = (path: string, targetGroupId?: number) => {
    closedTabs.push(path);
    if (closedTabs.length > 20) closedTabs.shift();

    const gid = targetGroupId ?? activeGroupId();
    updateGroup(gid, (g) => {
      const remaining = g.openFiles.filter((f) => f !== path);
      return {
        ...g,
        openFiles: remaining,
        activeFile: g.activeFile === path
          ? (remaining.length > 0 ? remaining[remaining.length - 1] : null)
          : g.activeFile,
      };
    });
    // Update legacy signals
    setOpenFiles((prev) => prev.filter((f) => f !== path));
    if (activeFile() === path) {
      const remaining = openFiles().filter((f) => f !== path);
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
    // Auto-close empty groups (except the primary group 0)
    const group = editorGroups().find((g) => g.id === gid);
    if (group && group.openFiles.length === 0 && gid !== 0) {
      closeGroup(gid);
    }
    document.dispatchEvent(new CustomEvent("codex:file-closed", { detail: { path } }));
  };

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  return (
    <Show when={authenticated()} fallback={<LoginPage onLogin={handleLogin} />}>
    <div class="app-shell" role="application" aria-label="CodeEX IDE">
      <TitleBar />

      <div class="app-body" role="main">
        <ActivityBar
          activePanel={activePanel()}
          onPanelChange={setActivePanel}
          onToggleChat={() => setChatVisible((v) => !v)}
          chatVisible={chatVisible()}
        />

        <Show when={sidebarVisible()}>
          <div style={{ width: `${sidebarWidth()}px`, "flex-shrink": 0 }} role="complementary" aria-label="Sidebar">
            <AppErrorBoundary name="Sidebar">
              <Sidebar
                activePanel={activePanel()}
                activeFile={activeFile()}
                openFiles={openFiles()}
                onOpenFile={openFile}
                onCloseFile={closeFile}
              />
            </AppErrorBoundary>
          </div>
          <ResizeHandle
            direction="horizontal"
            onResize={(delta) => setSidebarWidth((w) => clamp(w + delta, 180, 500))}
          />
        </Show>

        <div class="editor-terminal-column" role="region" aria-label="Editor">
          <div class="editor-groups-row">
            <For each={editorGroups()}>
              {(group, idx) => (
                <>
                  <Show when={idx() > 0}>
                    <ResizeHandle direction="horizontal" onResize={() => {}} />
                  </Show>
                  <div
                    class={`editor-group ${activeGroupId() === group.id ? "active-group" : ""}`}
                    onClick={() => setActiveGroupId(group.id)}
                  >
                    <AppErrorBoundary name="Editor">
                      <EditorArea
                        openFiles={group.openFiles}
                        activeFile={group.activeFile}
                        onSelectFile={(file) => {
                          updateGroup(group.id, (g) => ({ ...g, activeFile: file }));
                          setActiveFile(file);
                          setActiveGroupId(group.id);
                        }}
                        onCloseFile={(file) => closeFile(file, group.id)}
                        onOpenFile={(file) => openFile(file, group.id)}
                        onReorderFiles={(files) => updateGroup(group.id, (g) => ({ ...g, openFiles: files }))}
                      />
                    </AppErrorBoundary>
                    <Show when={editorGroups().length > 1}>
                      <button
                        class="editor-group-close"
                        title="Close editor group"
                        onClick={(e) => { e.stopPropagation(); closeGroup(group.id); }}
                      >&times;</button>
                    </Show>
                  </div>
                </>
              )}
            </For>
          </div>
          <Show when={terminalVisible()}>
            <ResizeHandle
              direction="vertical"
              onResize={(delta) => setTerminalHeight((h) => clamp(h - delta, 120, 600))}
            />
            <div class="bottom-panel-tabs">
              <button class={`bottom-tab ${bottomTab() === "terminal" ? "active" : ""}`} onClick={() => setBottomTab("terminal")}>Terminal</button>
              <button class={`bottom-tab ${bottomTab() === "problems" ? "active" : ""}`} onClick={() => setBottomTab("problems")}>Problems</button>
              <button class={`bottom-tab ${bottomTab() === "output" ? "active" : ""}`} onClick={() => setBottomTab("output")}>Output</button>
              <button class={`bottom-tab ${bottomTab() === "debug" ? "active" : ""}`} onClick={() => setBottomTab("debug")}>Debug</button>
            </div>
          </Show>
          <TerminalPanel
            visible={terminalVisible() && bottomTab() === "terminal"}
            height={terminalHeight()}
          />
          <ProblemsPanel
            visible={terminalVisible() && bottomTab() === "problems"}
            height={terminalHeight()}
            onOpenFile={(path, line) => { openFile(path); if (line) document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line } })); }}
          />
          <OutputPanel
            visible={terminalVisible() && bottomTab() === "output"}
            height={terminalHeight()}
          />
          <DebugPanel
            visible={terminalVisible() && bottomTab() === "debug"}
            height={terminalHeight()}
            onOpenFile={(path, line) => { openFile(path); if (line) document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line } })); }}
          />
        </div>

        <Show when={chatVisible()}>
          <ResizeHandle
            direction="horizontal"
            onResize={(delta) => setChatWidth((w) => clamp(w - delta, 280, 600))}
          />
          <div style={{ width: `${chatWidth()}px`, "flex-shrink": 0 }}>
            <AppErrorBoundary name="Chat">
              <ChatPanel />
            </AppErrorBoundary>
          </div>
        </Show>
      </div>

      <StatusBar
        activeFile={activeFile()}
        sidebarVisible={sidebarVisible()}
        chatVisible={chatVisible()}
      />

      <Show when={commandPaletteOpen()}>
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      </Show>

      <Show when={quickOpenVisible()}>
        <QuickOpen onOpenFile={openFile} onClose={() => setQuickOpenVisible(false)} />
      </Show>

      <Show when={settingsOpen()}>
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      </Show>

      <Show when={keyboardHelpOpen()}>
        <KeyboardHelp onClose={() => setKeyboardHelpOpen(false)} />
      </Show>

      <Show when={goToLineOpen()}>
        <GoToLine
          maxLine={editorMaxLine()}
          currentLine={cursorLine()}
          onGo={(line) => document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line } }))}
          onClose={() => setGoToLineOpen(false)}
        />
      </Show>

      <Show when={goToSymbolOpen()}>
        <GoToSymbol
          symbols={goToSymbolList()}
          onGo={(line) => document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line } }))}
          onClose={() => setGoToSymbolOpen(false)}
        />
      </Show>

      <Show when={diffState()}>
        {(ds) => (
          <DiffViewer
            fileName={ds().fileName}
            oldContent={ds().oldContent}
            newContent={ds().newContent}
            onAccept={() => { ds().onAccept?.(); setDiffState(null); }}
            onReject={() => { ds().onReject?.(); setDiffState(null); }}
            onClose={() => setDiffState(null)}
          />
        )}
      </Show>

      <NotificationToast />
    </div>
    </Show>
  );
}
