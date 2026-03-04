// ============================================================================
// CodeEX v2 — Gixsis Chat Panel
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Conversational AI interface connected to TerraForge Engine.
// Supports streaming responses, ageixt mode with tool calls, and plan mode.
// ============================================================================

import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import { marked } from "marked";
import { streamChat, getTerraForgeStatus } from "~/lib/terraforge-client";
import { notify } from "~/lib/notifications";
import { buildAgeixtSystemPrompt, parseToolCalls, executeTool, applyEdit, checkDestructive, clearAgeixtTodos, setAgeixtModel } from "~/lib/agent-tools";
import { TodoPanel } from "./TodoPanel";
import { connectWithRetry, disconnectSession, isConnected } from "~/lib/mcp-client";
import {
  isSTTAvailable, startListening, stopListening, toggleListening, getListeningState,
  transcribeFile,
} from "~/lib/stt-engine";
import {
  readDocument, readDocuments, isSupportedFormat, buildDocumentContext,
} from "~/lib/document-reader";
import type { DocumentContent } from "~/lib/document-reader";
import { ToolCallBlock } from "./ToolCallBlock";
import type { ChatMessage } from "~/lib/types";
import type { ToolResult } from "~/lib/agent-tools";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const GIXSIS_SYSTEM_PROMPT = `You are Gixsis (pronounced "genesis"), a sovereign AI assistant built by TerraTech Systems. You are running inside CodeEX v2, a clean-sheet IDE built with SolidJS and CodeMirror 6.

Your capabilities:
- You help users write, understand, and debug code
- You can explain concepts, suggest improvements, and answer technical questions
- You are knowledgeable across all programming languages and frameworks
- You are concise, accurate, and direct in your responses
- You use markdown formatting: code blocks with language tags, bold for emphasis, lists for structure

Your identity:
- Name: Gixsis
- Creator: TerraTech Systems, founded by Tanen Andrews
- Engine: TerraForge (sovereign inference runtime)
- You are NOT ChatGPT, Copilot, or any other AI. You are Gixsis.

Keep responses focused and technical. Use code blocks with syntax highlighting. Be helpful without being verbose.`;

interface TFModel {
  id: string;
  status: "loaded" | "unloaded" | "unknown";
}

export function ChatPanel() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [inputText, setInputText] = createSignal("");
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [model, setModel] = createSignal("gixsis-v4.0.1");
  const [agentMode, setAgentMode] = createSignal(false);
  const [toolResults, setToolResults] = createSignal<Map<string, ToolResult[]>>(new Map());
  // Dynamic model list from TerraForge
  const [availableModels, setAvailableModels] = createSignal<TFModel[]>([
    { id: "gixsis-v4.0.1", status: "unknown" },
  ]);
  // STT state
  const [sttActive, setSTTActive] = createSignal(false);
  const [sttInterim, setSTTInterim] = createSignal("");
  // Document ingestion state
  const [attachedDocs, setAttachedDocs] = createSignal<DocumentContent[]>([]);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isTranscribing, setIsTranscribing] = createSignal(false);
  // MCP connection state
  const [mcpConnected, setMCPConnected] = createSignal(false);
  const [mcpToolCount, setMCPToolCount] = createSignal(0);
  // Permission gate state
  const [pendingApproval, setPendingApproval] = createSignal<{ command: string; resolve: (ok: boolean) => void } | null>(null);

  /** Display name for the currently selected model. */
  const modelDisplayName = () => {
    const m = model();
    // Short friendly names
    if (m === "gixsis-v4.0.1") return "Gixsis v4.0.1";
    if (m === "gixsis-code-32b") return "Gixsis Code 32B";
    return m; // show raw ID for any other model
  };

  /** Fetch available models from TerraForge on mount. */
  const fetchModels = async () => {
    try {
      const res = await getTerraForgeStatus();
      if (res.available && res.models.length > 0) {
        const models: TFModel[] = res.models.map((m: any) => ({
          id: m.id ?? m.name,
          status: (m as any).status?.value === "loaded" ? "loaded" as const : "unloaded" as const,
        }));
        setAvailableModels(models);
        // If current model not in list, select first loaded or first available
        const ids = models.map((m) => m.id);
        if (!ids.includes(model())) {
          const loaded = models.find((m) => m.status === "loaded");
          setModel(loaded?.id ?? models[0].id);
          setAgeixtModel(loaded?.id ?? models[0].id);
        }
      }
    } catch { /* TerraForge unreachable — keep defaults */ }
  };

  /** Show an inline approval prompt for destructive commands. Returns true if approved. */
  const requestApproval = (command: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingApproval({ command, resolve });
    });
  };
  const handleApproval = (approved: boolean) => {
    const pending = pendingApproval();
    if (pending) {
      pending.resolve(approved);
      setPendingApproval(null);
    }
  };
  let messagesEnd: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  const scrollToBottom = () => {
    messagesEnd?.scrollIntoView({ behavior: "smooth" });
  };

  const getSystemPrompt = () => {
    let base = agentMode()
      ? buildAgeixtSystemPrompt(GIXSIS_SYSTEM_PROMPT)
      : GIXSIS_SYSTEM_PROMPT;

    // Inject attached document context
    const docs = attachedDocs();
    if (docs.length > 0) {
      const docContext = buildDocumentContext(docs);
      base += "\n\n" + docContext;
    }

    return base;
  };

  /** Process tool calls found in a completed response. */
  const processToolCalls = async (msgId: string, content: string) => {
    const calls = parseToolCalls(content);
    if (calls.length === 0) return;

    const results: ToolResult[] = [];
    for (const call of calls) {
      const callId = crypto.randomUUID();
      const result = await executeTool(callId, call.name, call.input);
      results.push(result);

      // For edit operations with diffs, auto-show the diff viewer
      if (result.diff && result.status === "success") {
        const diffPayload = result.diff;
        document.dispatchEvent(
          new CustomEvent("codex:show-diff", {
            detail: {
              fileName: diffPayload.fileName,
              oldContent: diffPayload.oldContent,
              newContent: diffPayload.newContent,
              onAccept: async () => {
                await applyEdit(diffPayload.fileName, diffPayload.newContent);
                notify(`Applied edit to ${diffPayload.fileName}`, "success", 3000);
              },
              onReject: () => {
                notify(`Rejected edit to ${diffPayload.fileName}`, "info", 3000);
              },
            },
          })
        );
      }
    }

    setToolResults((prev) => {
      const next = new Map(prev);
      next.set(msgId, results);
      return next;
    });
  };

  const sendMessage = async () => {
    const text = inputText().trim();
    if (!text || isStreaming()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      status: "complete",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsStreaming(true);
    scrollToBottom();

    // Build conversation history from completed messages (before this user msg)
    const priorMessages = messages()
      .filter((m) => m.status === "complete" && m.id !== userMsg.id)
      .map((m) => ({ role: m.role, content: m.content }));

    let turnHistory: { role: string; content: string }[] = [
      { role: "system", content: getSystemPrompt() },
      ...priorMessages,
      { role: "user", content: text },
    ];

    const MAX_AGEIXT_TURNS = 10;
    let turnCount = 0;

    try {
      while (turnCount < MAX_AGEIXT_TURNS) {
        turnCount++;

        // Create streaming assistant message for this turn
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          status: "streaming",
        };
        setMessages((prev) => [...prev, assistantMsg]);
        scrollToBottom();

        // Stream the response
        let fullContent = "";
        for await (const chunk of streamChat(model(), turnHistory)) {
          fullContent += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: fullContent } : m
            )
          );
          scrollToBottom();
        }

        // Mark complete
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, status: "complete" } : m
          )
        );

        // If not ageixt mode, done after first response
        if (!agentMode()) break;

        // Parse tool calls from the response
        const calls = parseToolCalls(fullContent);
        if (calls.length === 0) break; // No tools = task complete

        // Execute each tool call
        const results: ToolResult[] = [];
        for (const call of calls) {
          const callId = crypto.randomUUID();

          // Permission gate — check for destructive operations
          const destructiveCmd = checkDestructive(call.name, call.input);
          if (destructiveCmd) {
            const approved = await requestApproval(destructiveCmd);
            if (!approved) {
              results.push({ toolCallId: callId, name: call.name, output: "BLOCKED: Operation denied by user via permission gate.", status: "error" });
              continue;
            }
          }

          const result = await executeTool(callId, call.name, call.input);
          results.push(result);

          // Auto-show diff viewer for edit operations
          if (result.diff && result.status === "success") {
            const diffPayload = result.diff;
            document.dispatchEvent(
              new CustomEvent("codex:show-diff", {
                detail: {
                  fileName: diffPayload.fileName,
                  oldContent: diffPayload.oldContent,
                  newContent: diffPayload.newContent,
                  onAccept: async () => {
                    await applyEdit(diffPayload.fileName, diffPayload.newContent);
                    notify(`Applied edit to ${diffPayload.fileName}`, "success", 3000);
                  },
                  onReject: () => {
                    notify(`Rejected edit to ${diffPayload.fileName}`, "info", 3000);
                  },
                },
              })
            );
          }
        }

        // Store tool results for UI display on this message
        setToolResults((prev) => {
          const next = new Map(prev);
          next.set(assistantMsg.id, results);
          return next;
        });

        // Build tool results context for the next turn
        const toolResultSummary = results
          .map((r) => `[Tool: ${r.name}] Status: ${r.status}\n${r.output}`)
          .join("\n\n");

        // Append assistant response + tool results to history for next turn
        turnHistory = [
          ...turnHistory,
          { role: "assistant", content: fullContent },
          { role: "user", content: `[Tool Results]\n\n${toolResultSummary}\n\nContinue based on these results. If the task is complete, provide a summary.` },
        ];
      }
    } catch (err: any) {
      const errorMsg = err.message || "Failed to connect to TerraForge";
      // Mark the last streaming message as error
      setMessages((prev) => {
        const lastStreaming = [...prev].reverse().find((m) => m.status === "streaming");
        if (!lastStreaming) return prev;
        return prev.map((m) =>
          m.id === lastStreaming.id
            ? { ...m, content: `Error: ${errorMsg}`, status: "error" }
            : m
        );
      });
      notify(`Gixsis: ${errorMsg}`, "error", 5000);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleViewDiff = (diff: NonNullable<ToolResult["diff"]>) => {
    document.dispatchEvent(
      new CustomEvent("codex:show-diff", {
        detail: {
          fileName: diff.fileName,
          oldContent: diff.oldContent,
          newContent: diff.newContent,
          onAccept: async () => {
            await applyEdit(diff.fileName, diff.newContent);
            notify(`Applied edit to ${diff.fileName}`, "success", 3000);
          },
          onReject: () => {
            notify(`Rejected edit to ${diff.fileName}`, "info", 3000);
          },
        },
      })
    );
  };

  const handleAcceptEdit = async (path: string, newContent: string) => {
    await applyEdit(path, newContent);
    notify(`Applied edit to ${path}`, "success", 3000);
  };

  // --- STT handlers ---
  const toggleSTT = () => {
    if (!isSTTAvailable()) {
      notify("Speech recognition not supported in this browser.", "error", 4000);
      return;
    }
    const newState = toggleListening({
      onResult: (text, isFinal) => {
        if (isFinal) {
          setInputText((prev) => (prev ? prev + " " + text : text));
          setSTTInterim("");
        } else {
          setSTTInterim(text);
        }
      },
      onStart: () => {
        setSTTActive(true);
        notify("Listening...", "info", 2000);
      },
      onEnd: () => {
        setSTTActive(false);
        setSTTInterim("");
      },
      onError: (err) => {
        setSTTActive(false);
        setSTTInterim("");
        notify(err, "error", 4000);
      },
    });
  };

  // --- Document ingestion handlers ---
  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);

    // Separate audio/video files for transcription
    const audioFiles = fileArr.filter((f) =>
      f.type.startsWith("audio/") || f.type.startsWith("video/")
    );
    const docFiles = fileArr.filter(
      (f) => !f.type.startsWith("audio/") && !f.type.startsWith("video/")
    );

    // Process documents
    if (docFiles.length > 0) {
      const supported = docFiles.filter((f) => isSupportedFormat(f.name));
      const unsupported = docFiles.filter((f) => !isSupportedFormat(f.name));

      if (unsupported.length > 0) {
        notify(`Unsupported: ${unsupported.map((f) => f.name).join(", ")}`, "warning", 4000);
      }

      if (supported.length > 0) {
        notify(`Reading ${supported.length} document(s)...`, "info", 2000);
        const contents = await readDocuments(supported);
        setAttachedDocs((prev) => [...prev, ...contents]);
        notify(
          `Attached ${contents.length} document(s) — ${contents.reduce((a, d) => a + d.wordCount, 0)} words total`,
          "success",
          3000
        );
      }
    }

    // Process audio/video files for transcription
    if (audioFiles.length > 0) {
      setIsTranscribing(true);
      for (const af of audioFiles) {
        try {
          notify(`Transcribing ${af.name}...`, "info", 3000);
          const result = await transcribeFile(af);
          // Add transcription as an attached document
          setAttachedDocs((prev) => [
            ...prev,
            {
              fileName: `${af.name} (transcription)`,
              mimeType: "text/plain",
              text: result.text,
              wordCount: result.text.split(/\s+/).filter(Boolean).length,
              charCount: result.text.length,
            },
          ]);
          notify(`Transcribed ${af.name} — ${result.text.length} chars`, "success", 3000);
        } catch (err: any) {
          notify(`Transcription failed: ${err.message}`, "error", 5000);
        }
      }
      setIsTranscribing(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeAttachedDoc = (idx: number) => {
    setAttachedDocs((prev) => prev.filter((_, i) => i !== idx));
  };

  // --- Keyboard shortcut: Ctrl+M toggle STT ---
  const handleSTTShortcut = (e: KeyboardEvent) => {
    if (e.ctrlKey && !e.shiftKey && e.key === "m") {
      e.preventDefault();
      toggleSTT();
    }
  };

  const handleUploadEvent = () => {
    fileInputRef?.click();
  };

  onMount(() => {
    inputRef?.focus();
    document.addEventListener("keydown", handleSTTShortcut);
    document.addEventListener("codex:upload-file", handleUploadEvent);

    // Fetch available models from TerraForge
    fetchModels();

    // Connect to MCP server in background (non-blocking)
    connectWithRetry(
      (session) => {
        setMCPConnected(true);
        setMCPToolCount(session.tools.length);
        notify(`MCP: ${session.tools.length} sovereign tools connected`, "success", 3000);
      },
      (_error) => {
        setMCPConnected(false);
        // Silent retry — don't spam notifications on reconnect attempts
      },
    );
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleSTTShortcut);
    document.removeEventListener("codex:upload-file", handleUploadEvent);
    if (getListeningState()) stopListening();
    disconnectSession();
  });

  return (
    <div class="chat-panel">
      <div class="chat-header">
        <div class="chat-header-left">
          <span class={`chat-header-icon ${agentMode() ? "ageixt" : ""}`}>{agentMode() ? "A" : "G"}</span>
          <span class="chat-header-title">{agentMode() ? "Ageixt" : "Chat"}</span>
          <span class="chat-header-model">{modelDisplayName()}</span>
        </div>
        <div class="chat-header-right">
          <button
            class={`chat-mode-btn ${!agentMode() ? "active" : ""}`}
            onClick={() => setAgentMode(false)}
            title="Standard chat mode"
          >
            Chat
          </button>
          <button
            class={`chat-mode-btn ${agentMode() ? "active" : ""}`}
            onClick={() => setAgentMode(true)}
            title="Agent mode with tool calling"
          >
            Ageixt
          </button>
          <span
            class={`mcp-status-dot ${mcpConnected() ? "connected" : ""}`}
            title={mcpConnected() ? `MCP: ${mcpToolCount()} tools` : "MCP: disconnected"}
          />
          <select
            class="model-select"
            value={model()}
            onChange={(e) => { setModel(e.currentTarget.value); setAgeixtModel(e.currentTarget.value); }}
          >
            <For each={availableModels()}>
              {(m) => (
                <option value={m.id}>
                  {m.id}{m.status === "loaded" ? " \u25CF" : m.status === "unloaded" ? " \u25CB" : ""}
                </option>
              )}
            </For>
          </select>
          <button
            class="model-refresh-btn"
            title="Refresh model list"
            onClick={fetchModels}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.65 2.35A8 8 0 1016 8h-2a6 6 0 11-1.76-4.24L10 6h6V0l-2.35 2.35z"/></svg>
          </button>
        </div>
      </div>

      <div class="chat-messages">
        <Show when={messages().length === 0}>
          <div class="chat-empty">
            <div class={`chat-empty-icon ${agentMode() ? "ageixt" : ""}`}>{agentMode() ? "A" : "G"}</div>
            <div class="chat-empty-title">{agentMode() ? "Ageixt Mode" : "Gixsis Chat"}</div>
            <div class="chat-empty-subtitle">
              <Show when={agentMode()} fallback={
                <>Sovereign AI assistant by TerraTech Systems.<br />Model: {modelDisplayName()}</>
              }>
                Agent mode with tool calling enabled.<br />Model: {modelDisplayName()} — {mcpConnected() ? `${mcpToolCount()} tools connected` : "MCP disconnected"}
              </Show>
            </div>
          </div>
        </Show>

        <For each={messages()}>
          {(msg) => {
            const rendered = createMemo(() => {
              if (msg.role === "user" || !msg.content) return "";
              // Strip tool_call blocks from visible markdown in ageixt mode
              const clean = agentMode()
                ? msg.content.replace(/```tool_call\s*\n[\s\S]*?```/g, "").trim()
                : msg.content;
              return marked.parse(clean) as string;
            });
            const msgToolResults = () => toolResults().get(msg.id) ?? [];
            return (
              <div class={`chat-message ${msg.role} ${msg.status ?? ""}`}>
                <div class="message-header">
                  <span class="message-role">
                    {msg.role === "user" ? "You" : "Gixsis"}
                  </span>
                  <Show when={agentMode() && msg.role === "assistant" && msg.status === "complete"}>
                    <span class="message-mode-badge">ageixt</span>
                  </Show>
                </div>
                <Show when={msg.role === "assistant" && msg.content}>
                  <div class="message-content markdown" innerHTML={rendered()} />
                </Show>
                <Show when={msg.role === "user"}>
                  <div class="message-content">{msg.content}</div>
                </Show>
                <Show when={!msg.content && msg.status === "streaming"}>
                  <div class="message-content streaming-dots">
                    <span class="dot" /><span class="dot" /><span class="dot" />
                  </div>
                </Show>
                {/* Tool call results */}
                <For each={msgToolResults()}>
                  {(result) => (
                    <ToolCallBlock
                      result={result}
                      onViewDiff={handleViewDiff}
                      onAcceptEdit={handleAcceptEdit}
                    />
                  )}
                </For>
              </div>
            );
          }}
        </For>
        {/* Permission gate approval prompt */}
        <Show when={pendingApproval()}>
          {(approval) => (
            <div class="permission-gate">
              <div class="permission-gate-header">
                <span class="permission-gate-icon">!</span>
                <span class="permission-gate-title">Permission Required</span>
              </div>
              <div class="permission-gate-body">
                <p class="permission-gate-desc">Gixsis wants to run a potentially destructive command:</p>
                <code class="permission-gate-cmd">{approval().command}</code>
              </div>
              <div class="permission-gate-actions">
                <button class="permission-gate-approve" onClick={() => handleApproval(true)}>Approve</button>
                <button class="permission-gate-deny" onClick={() => handleApproval(false)}>Deny</button>
              </div>
            </div>
          )}
        </Show>
        {/* Ageixt todo progress tracker */}
        <Show when={agentMode()}>
          <TodoPanel />
        </Show>
        <div ref={messagesEnd} />
      </div>

      {/* Attached documents indicator */}
      <Show when={attachedDocs().length > 0}>
        <div class="chat-attached-docs">
          <For each={attachedDocs()}>
            {(doc, i) => (
              <div class="attached-doc-chip">
                <span class="attached-doc-icon">{doc.mimeType.includes("pdf") ? "P" : "D"}</span>
                <span class="attached-doc-name" title={`${doc.fileName} — ${doc.wordCount} words`}>
                  {doc.fileName.length > 20 ? doc.fileName.slice(0, 18) + "..." : doc.fileName}
                </span>
                <button class="attached-doc-remove" onClick={() => removeAttachedDoc(i())}>
                  &times;
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* STT interim display */}
      <Show when={sttActive() && sttInterim()}>
        <div class="stt-interim">
          <span class="stt-interim-dot" />
          <span class="stt-interim-text">{sttInterim()}</span>
        </div>
      </Show>

      <div
        class={`chat-input-area ${isDragging() ? "dragging" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          accept=".pdf,.md,.txt,.csv,.json,.jsonl,.xml,.html,.yaml,.yml,.toml,.docx,.xlsx,.ts,.tsx,.js,.jsx,.py,.rs,.go,.cpp,.c,.h,.java,.rb,.sh,.bat,.ps1,.sql,.mp3,.wav,.m4a,.ogg,.webm,.mp4"
          onChange={(e) => {
            if (e.currentTarget.files?.length) {
              handleFileUpload(e.currentTarget.files);
              e.currentTarget.value = "";
            }
          }}
        />

        {/* Upload button */}
        <button
          class="chat-action-btn"
          onClick={() => fileInputRef?.click()}
          title="Attach files (documents, audio for transcription)"
          disabled={isStreaming()}
        >
          +
        </button>

        {/* Mic button */}
        <button
          class={`chat-action-btn mic-btn ${sttActive() ? "active" : ""}`}
          onClick={toggleSTT}
          title={sttActive() ? "Stop listening (Ctrl+M)" : "Start voice input (Ctrl+M)"}
          disabled={isStreaming() || isTranscribing()}
        >
          {sttActive() ? "\u23F9" : "\uD83C\uDFA4"}
        </button>

        <textarea
          ref={inputRef}
          class="chat-input"
          placeholder={
            isDragging()
              ? "Drop files here..."
              : sttActive()
              ? "Listening... speak now"
              : agentMode()
              ? "Tell Gixsis what to do..."
              : "Ask Gixsis..."
          }
          value={inputText()}
          onInput={(e) => {
            setInputText(e.currentTarget.value);
            // Auto-resize
            e.currentTarget.style.height = "auto";
            e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 120) + "px";
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isStreaming()}
        />
        <button
          class="chat-send"
          onClick={sendMessage}
          disabled={isStreaming() || !inputText().trim()}
        >
          {isStreaming() ? "..." : "\u2191"}
        </button>
      </div>

      {/* Drag overlay */}
      <Show when={isDragging()}>
        <div class="chat-drop-overlay">Drop files to attach</div>
      </Show>

      <style>{`
        .chat-panel {
          width: 100%;
          height: 100%;
          background: var(--bg-base);
          border-left: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          position: relative;
          min-width: 0;
          overflow: hidden;
        }
        .chat-header {
          height: var(--tab-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-2);
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          flex-shrink: 0;
          min-width: 0;
          overflow: hidden;
          gap: var(--space-1);
        }
        .chat-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          min-width: 0;
          overflow: hidden;
          flex-shrink: 1;
        }
        .chat-header-right {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          flex-shrink: 0;
        }
        .chat-header-icon {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-purple);
          color: white;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-weight: 700;
        }
        .chat-header-icon.ageixt {
          background: linear-gradient(135deg, var(--accent-green), var(--accent-teal, #64d2ff));
        }
        .chat-header-title {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .chat-header-model {
          font-size: 10px;
          font-weight: 500;
          color: var(--text-tertiary);
          background: var(--bg-elevated);
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
        }
        .chat-mode-btn {
          height: 24px;
          padding: 0 var(--space-2);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .chat-mode-btn:hover {
          color: var(--text-secondary);
          background: var(--bg-hover);
        }
        .chat-mode-btn.active {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }
        /* Permission gate */
        .permission-gate {
          margin: var(--space-3);
          padding: var(--space-3);
          background: rgba(255, 69, 58, 0.08);
          border: 1px solid rgba(255, 69, 58, 0.3);
          border-radius: var(--radius-md);
        }
        .permission-gate-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }
        .permission-gate-icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-red);
          color: #fff;
          border-radius: 50%;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .permission-gate-title {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--accent-red);
        }
        .permission-gate-desc {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0 0 var(--space-2) 0;
        }
        .permission-gate-cmd {
          display: block;
          padding: var(--space-2);
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--accent-orange);
          word-break: break-all;
          margin-bottom: var(--space-3);
        }
        .permission-gate-actions {
          display: flex;
          gap: var(--space-2);
        }
        .permission-gate-approve {
          padding: 4px 16px;
          background: var(--accent-green);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .permission-gate-approve:hover {
          opacity: 0.85;
        }
        .permission-gate-deny {
          padding: 4px 16px;
          background: var(--accent-red);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .permission-gate-deny:hover {
          opacity: 0.85;
        }
        .mcp-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-disabled);
          flex-shrink: 0;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .mcp-status-dot.connected {
          background: var(--accent-green);
          box-shadow: 0 0 6px rgba(48, 209, 88, 0.5);
        }
        .model-select {
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-family: var(--font-ui);
          font-size: 10px;
          padding: 2px 4px;
          outline: none;
          cursor: pointer;
          max-width: 140px;
        }
        .model-select:focus {
          border-color: var(--accent-purple);
        }
        .model-refresh-btn {
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          border-radius: var(--radius-sm);
          transition: all var(--duration-fast) var(--ease-out);
        }
        .model-refresh-btn:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .chat-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
        }
        .chat-empty-icon {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
          border-radius: var(--radius-lg);
          font-family: var(--font-mono);
          font-size: 24px;
          font-weight: 700;
          color: white;
          box-shadow: var(--glow-purple);
        }
        .chat-empty-icon.ageixt {
          background: linear-gradient(135deg, var(--accent-green), var(--accent-teal, #64d2ff));
          box-shadow: 0 0 20px rgba(48, 209, 88, 0.3);
        }
        .chat-empty-title {
          font-size: var(--text-xl);
          font-weight: 700;
          color: var(--text-primary);
        }
        .chat-empty-subtitle {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
          text-align: center;
          line-height: 1.6;
        }
        .chat-agent-badge {
          font-size: var(--text-xs);
          color: var(--accent-green);
          background: rgba(48, 209, 88, 0.1);
          border: 1px solid rgba(48, 209, 88, 0.2);
          border-radius: var(--radius-md);
          padding: var(--space-1) var(--space-3);
          font-weight: 600;
        }
        .chat-message {
          padding: var(--space-3);
          border-radius: var(--radius-md);
        }
        .chat-message.user {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
        }
        .chat-message.assistant {
          background: transparent;
        }
        .chat-message.error .message-content {
          color: var(--accent-red);
        }
        .message-header {
          margin-bottom: var(--space-1);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .message-role {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .chat-message.assistant .message-role {
          color: var(--accent-purple);
        }
        .message-mode-badge {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--accent-green);
          background: rgba(48, 209, 88, 0.1);
          border-radius: 6px;
          padding: 1px 6px;
        }
        .message-content {
          font-size: var(--text-sm);
          color: var(--text-primary);
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: var(--font-ui);
        }
        .message-content.markdown {
          white-space: normal;
        }
        .message-content.markdown p {
          margin: 0 0 var(--space-2) 0;
        }
        .message-content.markdown p:last-child {
          margin-bottom: 0;
        }
        .message-content.markdown code {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 1px 5px;
          font-family: var(--font-mono);
          font-size: 0.9em;
          color: var(--accent-teal);
        }
        .message-content.markdown pre {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          overflow-x: auto;
          margin: var(--space-2) 0;
        }
        .message-content.markdown pre code {
          background: none;
          border: none;
          padding: 0;
          color: var(--text-primary);
          font-size: var(--text-xs);
        }
        .message-content.markdown ul, .message-content.markdown ol {
          margin: var(--space-2) 0;
          padding-left: var(--space-4);
        }
        .message-content.markdown li {
          margin-bottom: var(--space-1);
        }
        .message-content.markdown h1, .message-content.markdown h2, .message-content.markdown h3 {
          color: var(--text-primary);
          margin: var(--space-3) 0 var(--space-2) 0;
          font-weight: 600;
        }
        .message-content.markdown h1 { font-size: var(--text-lg); }
        .message-content.markdown h2 { font-size: var(--text-md); }
        .message-content.markdown h3 { font-size: var(--text-sm); }
        .message-content.markdown blockquote {
          border-left: 3px solid var(--accent-purple);
          padding-left: var(--space-3);
          margin: var(--space-2) 0;
          color: var(--text-secondary);
        }
        .message-content.markdown a {
          color: var(--accent-blue);
          text-decoration: none;
        }
        .message-content.markdown a:hover {
          text-decoration: underline;
        }
        .message-content.markdown strong {
          color: var(--text-primary);
          font-weight: 600;
        }
        .streaming-dots {
          display: flex;
          gap: 4px;
          padding: 4px 0;
        }
        .streaming-dots .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-purple);
          animation: dotPulse 1.4s infinite ease-in-out both;
        }
        .streaming-dots .dot:nth-child(1) { animation-delay: -0.32s; }
        .streaming-dots .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .chat-input-area {
          padding: var(--space-3);
          border-top: 1px solid var(--border-subtle);
          display: flex;
          gap: var(--space-2);
          align-items: flex-end;
        }
        .chat-input {
          flex: 1;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          padding: var(--space-2) var(--space-3);
          outline: none;
          resize: none;
          min-height: 36px;
          max-height: 120px;
          line-height: 1.5;
          transition: border-color var(--duration-fast) var(--ease-out);
        }
        .chat-input:focus {
          border-color: var(--accent-purple);
        }
        .chat-input::placeholder {
          color: var(--text-disabled);
        }
        .chat-send {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-purple);
          border: none;
          border-radius: var(--radius-md);
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .chat-send:hover:not(:disabled) {
          background: var(--accent-blue);
          box-shadow: var(--glow-blue);
        }
        .chat-send:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        /* --- STT & Document Ingestion Styles --- */
        .chat-action-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: 16px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .chat-action-btn:hover:not(:disabled) {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--accent-purple);
        }
        .chat-action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .mic-btn.active {
          background: var(--accent-red);
          border-color: var(--accent-red);
          color: white;
          animation: micPulse 1.5s infinite ease-in-out;
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 69, 58, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(255, 69, 58, 0); }
        }
        .stt-interim {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 4px var(--space-3);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          font-style: italic;
          border-top: 1px solid var(--border-subtle);
        }
        .stt-interim-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-red);
          animation: micPulse 1.5s infinite ease-in-out;
          flex-shrink: 0;
        }
        .stt-interim-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-input-area.dragging {
          border-color: var(--accent-blue);
          background: rgba(41, 151, 255, 0.05);
        }
        .chat-drop-overlay {
          position: absolute;
          bottom: 60px;
          left: var(--space-3);
          right: var(--space-3);
          padding: var(--space-3);
          background: rgba(41, 151, 255, 0.1);
          border: 2px dashed var(--accent-blue);
          border-radius: var(--radius-md);
          text-align: center;
          font-size: var(--text-sm);
          color: var(--accent-blue);
          font-weight: 600;
          pointer-events: none;
        }
        .chat-attached-docs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 6px var(--space-3);
          border-top: 1px solid var(--border-subtle);
        }
        .attached-doc-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 2px 8px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
          max-width: 180px;
        }
        .attached-doc-icon {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-blue);
          color: white;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .attached-doc-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .attached-doc-remove {
          background: transparent;
          border: none;
          color: var(--text-disabled);
          cursor: pointer;
          font-size: 14px;
          padding: 0 2px;
          line-height: 1;
          flex-shrink: 0;
        }
        .attached-doc-remove:hover {
          color: var(--accent-red);
        }
      `}</style>
    </div>
  );
}
