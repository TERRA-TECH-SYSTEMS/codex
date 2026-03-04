// ============================================================================
// CodeEX v2 — Terminal Panel (xterm.js) — Multiple Concurrent Terminals
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Integrated terminal using xterm.js with multiple concurrent instances.
// In TerraRuntime (desktop), connects to real PTYs with profile selection.
// In PWA mode, provides local echo terminals.
// ============================================================================

import { onMount, onCleanup, createSignal, Show, For, createEffect } from "solid-js";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

interface Props {
  visible: boolean;
  height?: number;
}

interface TerminalProfile {
  id: string;
  label: string;
  shell: string;
  icon: string;
}

interface TerminalInstance {
  id: number;
  terminal: Terminal;
  container: HTMLDivElement;
  ptyId: string | null;
  unlistenPty: (() => void) | null;
  profileId: string;
  badge: string;
  inputBuffer: string;
}

const PROFILES: TerminalProfile[] = [
  { id: "powershell", label: "PowerShell", shell: "powershell.exe", icon: "PS" },
  { id: "cmd", label: "Command Prompt", shell: "cmd.exe", icon: ">" },
  { id: "gitbash", label: "Git Bash", shell: "C:\\Program Files\\Git\\bin\\bash.exe", icon: "$" },
  { id: "wsl", label: "WSL", shell: "wsl.exe", icon: "~" },
];

const PROFILE_STORAGE_KEY = "codex-terminal-profile";
const MAX_TERMINALS = 8;

function loadProfile(): string {
  return localStorage.getItem(PROFILE_STORAGE_KEY) || "powershell";
}

function saveProfile(id: string): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, id);
}

function getProfile(id: string): TerminalProfile {
  return PROFILES.find((p) => p.id === id) || PROFILES[0];
}

const XTERM_THEME = {
  background: "#0a0a0a",
  foreground: "#f5f5f7",
  cursor: "#2997ff",
  cursorAccent: "#0a0a0a",
  selectionBackground: "rgba(41, 151, 255, 0.3)",
  selectionForeground: "#f5f5f7",
  black: "#1d1d1f",
  red: "#ff453a",
  green: "#30d158",
  yellow: "#ff9f0a",
  blue: "#2997ff",
  magenta: "#bf5af2",
  cyan: "#64d2ff",
  white: "#f5f5f7",
  brightBlack: "#48484a",
  brightRed: "#ff6961",
  brightGreen: "#4cd964",
  brightYellow: "#ffcc02",
  brightBlue: "#5ac8fa",
  brightMagenta: "#da8fff",
  brightCyan: "#70d7ff",
  brightWhite: "#ffffff",
};

let nextTerminalId = 1;

export function TerminalPanel(props: Props) {
  let wrapperRef: HTMLDivElement | undefined;
  const [instances, setInstances] = createSignal<TerminalInstance[]>([]);
  const [activeId, setActiveId] = createSignal<number | null>(null);
  const [splitIds, setSplitIds] = createSignal<number[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = createSignal(false);
  const [isDesktop, setIsDesktop] = createSignal(false);

  const activeInstance = () => instances().find((i) => i.id === activeId()) ?? null;
  const isSplit = () => splitIds().length > 1;

  const createXterm = (): Terminal => {
    return new Terminal({
      theme: XTERM_THEME,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowTransparency: true,
      convertEol: true,
    });
  };

  const killInstancePty = async (inst: TerminalInstance) => {
    const terraRuntime = (window as any).__TAURI__;
    if (inst.ptyId && terraRuntime?.core?.invoke) {
      try {
        await terraRuntime.core.invoke("pty_kill", { ptyId: inst.ptyId });
      } catch {}
    }
    inst.unlistenPty?.();
    inst.unlistenPty = null;
    inst.ptyId = null;
  };

  const spawnPtyForInstance = async (inst: TerminalInstance, profile: TerminalProfile) => {
    const terraRuntime = (window as any).__TAURI__;
    if (!terraRuntime?.core?.invoke) return;

    await killInstancePty(inst);

    const cols = Math.max(Math.floor(inst.container.clientWidth / 7.8), 20);
    const rows = Math.max(Math.floor(inst.container.clientHeight / 18.2), 5);

    try {
      inst.ptyId = await terraRuntime.core.invoke("pty_spawn", {
        shell: profile.shell,
        cols,
        rows,
      });
      inst.badge = profile.label;
      inst.profileId = profile.id;
      updateInstance(inst);

      if (terraRuntime.event?.listen) {
        const localPtyId = inst.ptyId;
        inst.unlistenPty = await terraRuntime.event.listen(
          "pty-output",
          (event: any) => {
            if (event.payload.ptyId === localPtyId) {
              inst.terminal.write(event.payload.data);
            }
          },
        );
      }
    } catch {
      inst.ptyId = null;
      inst.badge = "Local";
      updateInstance(inst);
      inst.terminal.writeln(`\x1b[31mFailed to spawn ${profile.label}\x1b[0m`);
      inst.terminal.writeln("\x1b[2mFalling back to local echo\x1b[0m");
      inst.terminal.writeln("");
      setupLocalEcho(inst);
    }
  };

  /** Force a reactive update for the instances signal. */
  const updateInstance = (inst: TerminalInstance) => {
    setInstances((prev) => prev.map((i) => i.id === inst.id ? { ...i, badge: inst.badge, profileId: inst.profileId } : i));
  };

  function setupLocalEcho(inst: TerminalInstance) {
    const term = inst.terminal;

    term.writeln("\x1b[1;36m  CodeEX Terminal\x1b[0m");
    term.writeln("\x1b[2m  TerraTech Systems — Sovereign IDE\x1b[0m");
    term.writeln("");
    term.writeln("\x1b[2m  Desktop mode: connects to system shell via TerraRuntime\x1b[0m");
    term.writeln("\x1b[2m  PWA mode: local echo (shell commands require desktop)\x1b[0m");
    term.writeln("");
    writePrompt(term);

    term.onData((data) => {
      switch (data) {
        case "\r":
          term.writeln("");
          handleCommand(inst, inst.inputBuffer);
          inst.inputBuffer = "";
          break;
        case "\x7f":
          if (inst.inputBuffer.length > 0) {
            inst.inputBuffer = inst.inputBuffer.slice(0, -1);
            term.write("\b \b");
          }
          break;
        case "\x03":
          term.writeln("^C");
          inst.inputBuffer = "";
          writePrompt(term);
          break;
        case "\x0c":
          term.clear();
          writePrompt(term);
          break;
        default:
          if (data >= " " || data === "\t") {
            inst.inputBuffer += data;
            term.write(data);
          }
          break;
      }
    });
  }

  function writePrompt(term: Terminal) {
    term.write("\x1b[1;34mcodex\x1b[0m \x1b[2m>\x1b[0m ");
  }

  function handleCommand(inst: TerminalInstance, cmd: string) {
    const term = inst.terminal;
    const trimmed = cmd.trim();
    if (!trimmed) { writePrompt(term); return; }

    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();

    switch (command) {
      case "help":
        term.writeln("\x1b[1mAvailable commands:\x1b[0m");
        term.writeln("  \x1b[36mhelp\x1b[0m        Show this help message");
        term.writeln("  \x1b[36mclear\x1b[0m       Clear the terminal");
        term.writeln("  \x1b[36mecho\x1b[0m        Echo text back");
        term.writeln("  \x1b[36mdate\x1b[0m        Show current date/time");
        term.writeln("  \x1b[36mstatus\x1b[0m      Show TerraForge connection status");
        term.writeln("  \x1b[36mversion\x1b[0m     Show CodeEX version");
        term.writeln("");
        term.writeln("\x1b[2m  Full shell access requires TerraRuntime (desktop mode)\x1b[0m");
        break;
      case "clear":
        term.clear();
        break;
      case "echo":
        term.writeln(parts.slice(1).join(" "));
        break;
      case "date":
        term.writeln(new Date().toString());
        break;
      case "version":
        term.writeln("CodeEX v2.0.0-alpha");
        term.writeln("TerraRuntime: pending");
        term.writeln("SolidJS + CodeMirror 6 + xterm.js");
        break;
      case "status":
        term.writeln("\x1b[33mChecking TerraForge...\x1b[0m");
        fetch("/terraforge/api/tags", { signal: AbortSignal.timeout(5000) })
          .then((res) => res.json())
          .then((data) => {
            const models = data.data ?? data.models ?? [];
            term.writeln(`\x1b[32mTerraForge: Connected\x1b[0m`);
            term.writeln(`Models: ${models.map((m: any) => m.id ?? m.name).join(", ")}`);
            writePrompt(term);
          })
          .catch(() => {
            term.writeln(`\x1b[31mTerraForge: Disconnected\x1b[0m`);
            writePrompt(term);
          });
        return;
      default:
        term.writeln(`\x1b[31mCommand not found:\x1b[0m ${command}`);
        term.writeln(`\x1b[2mType 'help' for available commands\x1b[0m`);
        break;
    }
    writePrompt(term);
  }

  /** Create a new terminal instance and add it to the list. */
  const createTerminalInstance = async (profileId?: string): Promise<TerminalInstance | null> => {
    if (instances().length >= MAX_TERMINALS) return null;
    if (!wrapperRef) return null;

    const pid = profileId || loadProfile();
    const profile = getProfile(pid);
    const id = nextTerminalId++;

    // Create container div for this terminal
    const container = document.createElement("div");
    container.className = "terminal-instance-container";
    container.style.cssText = "flex: 1; overflow: hidden; display: none; padding: var(--space-2, 8px);";
    wrapperRef.appendChild(container);

    // Create xterm instance
    const terminal = createXterm();
    terminal.open(container);

    const inst: TerminalInstance = {
      id,
      terminal,
      container,
      ptyId: null,
      unlistenPty: null,
      profileId: pid,
      badge: "Local",
      inputBuffer: "",
    };

    // Connect to PTY or local echo
    const terraRuntime = (window as any).__TAURI__;
    if (terraRuntime?.core?.invoke) {
      setIsDesktop(true);
      const cols = Math.max(Math.floor(container.clientWidth / 7.8), 20);
      const rows = Math.max(Math.floor(container.clientHeight / 18.2), 5);

      try {
        inst.ptyId = await terraRuntime.core.invoke("pty_spawn", {
          shell: profile.shell,
          cols,
          rows,
        });
        inst.badge = profile.label;

        if (terraRuntime.event?.listen) {
          const localPtyId = inst.ptyId;
          inst.unlistenPty = await terraRuntime.event.listen(
            "pty-output",
            (event: any) => {
              if (event.payload.ptyId === localPtyId) {
                inst.terminal.write(event.payload.data);
              }
            },
          );
        }

        // Pipe terminal input to PTY
        terminal.onData((data) => {
          if (inst.ptyId) {
            terraRuntime.core.invoke("pty_write", { ptyId: inst.ptyId, data }).catch(() => {});
          }
        });
      } catch {
        inst.ptyId = null;
        setupLocalEcho(inst);
      }
    } else {
      setupLocalEcho(inst);
    }

    // Add to instances and set as active
    setInstances((prev) => [...prev, inst]);
    setActiveId(id);
    // Initialize split group to single pane if not already in a split
    if (splitIds().length <= 1) {
      setSplitIds([id]);
    }

    return inst;
  };

  /** Remove a terminal instance. */
  const removeTerminalInstance = async (id: number) => {
    const inst = instances().find((i) => i.id === id);
    if (!inst) return;

    await killInstancePty(inst);
    inst.terminal.dispose();
    inst.container.remove();

    setInstances((prev) => prev.filter((i) => i.id !== id));

    // Remove from split group
    setSplitIds((prev) => prev.filter((sid) => sid !== id));

    // If we removed the active terminal, switch to the last remaining one
    if (activeId() === id) {
      const remaining = instances().filter((i) => i.id !== id);
      const nextId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      setActiveId(nextId);
      if (nextId !== null && splitIds().length === 0) {
        setSplitIds([nextId]);
      }
    }
  };

  /** Switch the visible terminal. If clicking a tab not in the split group, exit split. */
  const switchToTerminal = (id: number) => {
    setActiveId(id);
    // If not in current split group, go to single-pane mode
    if (!splitIds().includes(id)) {
      setSplitIds([id]);
    }
  };

  /** Split the terminal: create a new terminal alongside the active one. */
  const splitTerminal = async () => {
    const current = activeId();
    if (current === null) return;
    const newInst = await createTerminalInstance();
    if (!newInst) return;
    setSplitIds((prev) => {
      const group = prev.length > 0 ? [...prev] : [current];
      if (!group.includes(newInst.id)) group.push(newInst.id);
      return group;
    });
    setActiveId(newInst.id);
  };

  /** Unsplit — go back to single-pane with the active terminal. */
  const unsplit = () => {
    const current = activeId();
    if (current !== null) {
      setSplitIds([current]);
    }
  };

  // Show/hide containers based on split group
  createEffect(() => {
    const group = splitIds();
    const active = activeId();
    for (const inst of instances()) {
      const visible = group.length > 1 ? group.includes(inst.id) : inst.id === active;
      inst.container.style.display = visible ? "block" : "none";
      inst.container.style.flex = visible ? "1" : "0";
      inst.container.style.borderRight = visible && group.length > 1 && inst.id !== group[group.length - 1]
        ? "1px solid var(--border-subtle)" : "none";
      // Trigger resize when becoming visible
      if (visible) {
        requestAnimationFrame(() => {
          const cols = Math.max(Math.floor(inst.container.clientWidth / 7.8), 20);
          const rows = Math.max(Math.floor(inst.container.clientHeight / 18.2), 5);
          if (cols > 0 && rows > 0) {
            try { inst.terminal.resize(cols, rows); } catch {}
          }
        });
      }
    }
  });

  const handleNewTerminal = async () => {
    await createTerminalInstance();
  };

  const handleKillActive = async () => {
    const active = activeId();
    if (active !== null) {
      await removeTerminalInstance(active);
    }
    // If no terminals remain, create a new one
    if (instances().length === 0) {
      // Don't auto-create — let user click + when ready
    }
  };

  const switchProfile = async (profileId: string) => {
    saveProfile(profileId);
    setProfileMenuOpen(false);
    const inst = activeInstance();
    if (!inst) return;
    if (isDesktop()) {
      inst.terminal.clear();
      const profile = getProfile(profileId);
      await spawnPtyForInstance(inst, profile);
    }
  };

  // Create the first terminal on mount
  onMount(async () => {
    await createTerminalInstance();

    // Resize observer for all terminals
    if (wrapperRef) {
      const observer = new ResizeObserver(() => {
        const active = activeInstance();
        if (!active) return;
        const cols = Math.max(Math.floor(active.container.clientWidth / 7.8), 20);
        const rows = Math.max(Math.floor(active.container.clientHeight / 18.2), 5);
        if (cols > 0 && rows > 0) {
          try { active.terminal.resize(cols, rows); } catch {}
          const terraRuntime = (window as any).__TAURI__;
          if (active.ptyId && terraRuntime?.core?.invoke) {
            terraRuntime.core.invoke("pty_resize", { ptyId: active.ptyId, cols, rows }).catch(() => {});
          }
        }
      });
      observer.observe(wrapperRef);

      onCleanup(() => {
        observer.disconnect();
        // Kill all PTYs on cleanup
        for (const inst of instances()) {
          killInstancePty(inst);
          inst.terminal.dispose();
        }
      });
    }
  });

  return (
    <div
      class="terminal-panel"
      style={{
        display: props.visible ? "flex" : "none",
        height: `${props.height ?? 240}px`,
      }}
    >
      <div class="terminal-header">
        <div class="terminal-header-left">
          {/* Terminal instance tabs */}
          <div class="terminal-tabs">
            <For each={instances()}>
              {(inst) => {
                const profile = () => getProfile(inst.profileId);
                return (
                  <button
                    class={`terminal-tab ${activeId() === inst.id ? "active" : ""} ${isSplit() && splitIds().includes(inst.id) ? "in-split" : ""}`}
                    onClick={() => switchToTerminal(inst.id)}
                  >
                    <span class="terminal-tab-icon">{profile().icon}</span>
                    <span class="terminal-tab-label">{inst.badge}</span>
                    <Show when={instances().length > 1}>
                      <span
                        class="terminal-tab-close"
                        onClick={(e) => { e.stopPropagation(); removeTerminalInstance(inst.id); }}
                      >
                        {"\u00D7"}
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
        <div class="terminal-header-actions">
          {/* Profile Selector */}
          <div class="terminal-profile-wrapper">
            <button
              class="terminal-action-btn"
              title="Select shell profile"
              onClick={() => setProfileMenuOpen((v) => !v)}
            >
              <span class="terminal-profile-icon">{getProfile(activeInstance()?.profileId || loadProfile()).icon}</span>
              <span class="terminal-caret">{"\u25BC"}</span>
            </button>
            <Show when={profileMenuOpen()}>
              <div class="terminal-profile-menu" onClick={(e) => e.stopPropagation()}>
                <For each={PROFILES}>
                  {(profile) => (
                    <button
                      class={`terminal-profile-item ${(activeInstance()?.profileId || loadProfile()) === profile.id ? "active" : ""}`}
                      onClick={() => switchProfile(profile.id)}
                    >
                      <span class="terminal-profile-item-icon">{profile.icon}</span>
                      <span>{profile.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
          {/* Split Terminal */}
          <button
            class="terminal-action-btn"
            title={isSplit() ? "Unsplit Terminal" : "Split Terminal Right"}
            onClick={isSplit() ? unsplit : splitTerminal}
            disabled={!isSplit() && instances().length >= MAX_TERMINALS}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <Show when={!isSplit()} fallback={
                <path d="M2 2h12v12H2V2zm1 1v10h10V3H3z"/>
              }>
                <path d="M2 2h12v12H2V2zm1 1v10h4V3H3zm5 0v10h4V3H8z"/>
              </Show>
            </svg>
          </button>
          {/* New Terminal */}
          <button
            class="terminal-action-btn"
            title={`New Terminal${instances().length >= MAX_TERMINALS ? " (max reached)" : ""}`}
            onClick={handleNewTerminal}
            disabled={instances().length >= MAX_TERMINALS}
          >
            +
          </button>
          {/* Kill Terminal */}
          <button
            class="terminal-action-btn terminal-action-danger"
            title="Kill Terminal"
            onClick={handleKillActive}
          >
            {"\u00D7"}
          </button>
        </div>
      </div>

      {/* Terminal containers — each instance mounts its xterm here */}
      <div class="terminal-wrapper" ref={wrapperRef} style={{ "flex-direction": isSplit() ? "row" : "column" }} />

      <style>{`
        .terminal-panel {
          display: flex;
          flex-direction: column;
          background: #0a0a0a;
          border-top: 1px solid var(--border-subtle);
          min-height: 120px;
          flex-shrink: 0;
        }
        .terminal-header {
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-3);
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .terminal-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex: 1;
          overflow: hidden;
        }
        .terminal-tabs {
          display: flex;
          align-items: center;
          gap: 1px;
          overflow-x: auto;
          max-width: 100%;
        }
        .terminal-tabs::-webkit-scrollbar {
          height: 0;
        }
        .terminal-tab {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 26px;
          padding: 0 8px;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 11px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .terminal-tab:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }
        .terminal-tab.active {
          background: rgba(41, 151, 255, 0.1);
          color: var(--accent-blue);
        }
        .terminal-tab.in-split:not(.active) {
          background: rgba(41, 151, 255, 0.04);
          color: var(--text-secondary);
        }
        .terminal-tab-icon {
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: 700;
          opacity: 0.7;
        }
        .terminal-tab-label {
          font-family: var(--font-ui);
        }
        .terminal-tab-close {
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          border-radius: 2px;
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .terminal-tab:hover .terminal-tab-close {
          opacity: 0.5;
        }
        .terminal-tab-close:hover {
          opacity: 1 !important;
          background: rgba(255, 69, 58, 0.15);
          color: #ff453a;
        }
        .terminal-header-actions {
          display: flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .terminal-action-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 14px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          padding: 0;
          gap: 2px;
        }
        .terminal-action-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .terminal-action-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .terminal-action-danger:hover {
          color: #ff453a;
        }
        .terminal-profile-wrapper {
          position: relative;
        }
        .terminal-profile-icon {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
        }
        .terminal-caret {
          font-size: 7px;
          opacity: 0.5;
        }
        .terminal-profile-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          width: 180px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-elevated);
          padding: 4px;
          z-index: 100;
        }
        .terminal-profile-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: 100%;
          height: 28px;
          padding: 0 var(--space-2);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          text-align: left;
        }
        .terminal-profile-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .terminal-profile-item.active {
          background: rgba(41, 151, 255, 0.1);
          color: var(--accent-blue);
        }
        .terminal-profile-item-icon {
          width: 16px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          text-align: center;
          flex-shrink: 0;
        }
        .terminal-wrapper {
          flex: 1;
          overflow: hidden;
          display: flex;
          position: relative;
        }
        .terminal-instance-container {
          padding: var(--space-2, 8px);
        }
        .terminal-instance-container .xterm {
          height: 100%;
        }
        .terminal-instance-container .xterm-viewport {
          overflow-y: auto;
        }
        .terminal-instance-container .xterm-viewport::-webkit-scrollbar {
          width: 6px;
        }
        .terminal-instance-container .xterm-viewport::-webkit-scrollbar-track {
          background: transparent;
        }
        .terminal-instance-container .xterm-viewport::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
