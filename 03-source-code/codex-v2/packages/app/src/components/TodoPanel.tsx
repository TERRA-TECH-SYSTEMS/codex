// ============================================================================
// CodeEX v2 — Ageixt Todo Panel
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Progress tracking panel for ageixt mode multi-step tasks.
// Matches CodeEX TodoWrite interaction parity.
// ============================================================================

import { createSignal, For, Show, onMount, onCleanup, createMemo } from "solid-js";
import type { TodoItem } from "~/lib/types";

export function TodoPanel() {
  const [todos, setTodos] = createSignal<TodoItem[]>([]);
  const [collapsed, setCollapsed] = createSignal(false);

  const stats = createMemo(() => {
    const items = todos();
    const completed = items.filter((t) => t.status === "completed").length;
    const inProgress = items.filter((t) => t.status === "in_progress").length;
    const pending = items.filter((t) => t.status === "pending").length;
    const total = items.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, inProgress, pending, total, pct };
  });

  const activeTask = createMemo(() => {
    return todos().find((t) => t.status === "in_progress");
  });

  const handleTodoUpdate = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.todos) {
      setTodos([...detail.todos]);
    }
  };

  onMount(() => {
    document.addEventListener("codex:todo-updated", handleTodoUpdate);
  });

  onCleanup(() => {
    document.removeEventListener("codex:todo-updated", handleTodoUpdate);
  });

  const statusIcon = (status: TodoItem["status"]) => {
    switch (status) {
      case "completed": return "\u2713";
      case "in_progress": return "\u25B6";
      case "pending": return "\u25CB";
    }
  };

  return (
    <Show when={todos().length > 0}>
      <div class="todo-panel">
        <div class="todo-header" onClick={() => setCollapsed(!collapsed())}>
          <div class="todo-header-left">
            <span class="todo-chevron">{collapsed() ? "\u25B8" : "\u25BE"}</span>
            <span class="todo-title">Tasks</span>
            <span class="todo-count">{stats().completed}/{stats().total}</span>
          </div>
          <div class="todo-header-right">
            <Show when={activeTask()}>
              <span class="todo-active-label">{activeTask()!.activeForm}</span>
            </Show>
            <span class="todo-pct">{stats().pct}%</span>
          </div>
        </div>

        <div class="todo-progress-bar">
          <div class="todo-progress-fill" style={{ width: `${stats().pct}%` }} />
        </div>

        <Show when={!collapsed()}>
          <div class="todo-list">
            <For each={todos()}>
              {(todo) => (
                <div class={`todo-item todo-${todo.status}`}>
                  <span class={`todo-icon todo-icon-${todo.status}`}>
                    {statusIcon(todo.status)}
                  </span>
                  <span class="todo-content">
                    {todo.status === "in_progress" ? todo.activeForm : todo.content}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <style>{`
          .todo-panel {
            margin: var(--space-2) 0;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: var(--bg-surface);
            overflow: hidden;
            font-size: var(--text-xs);
          }
          .todo-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-2) var(--space-3);
            cursor: pointer;
            user-select: none;
            transition: background var(--duration-fast) var(--ease-out);
          }
          .todo-header:hover {
            background: var(--bg-hover);
          }
          .todo-header-left {
            display: flex;
            align-items: center;
            gap: var(--space-2);
          }
          .todo-header-right {
            display: flex;
            align-items: center;
            gap: var(--space-3);
          }
          .todo-chevron {
            color: var(--text-tertiary);
            font-size: 10px;
            width: 12px;
          }
          .todo-title {
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: 0.02em;
          }
          .todo-count {
            color: var(--text-tertiary);
            font-family: var(--font-mono);
            font-size: 10px;
          }
          .todo-active-label {
            color: var(--accent-blue);
            font-style: italic;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .todo-pct {
            color: var(--accent-green);
            font-weight: 600;
            font-family: var(--font-mono);
            font-size: 10px;
          }
          .todo-progress-bar {
            height: 2px;
            background: var(--border-subtle);
          }
          .todo-progress-fill {
            height: 100%;
            background: var(--accent-green);
            transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .todo-list {
            padding: var(--space-1) 0;
          }
          .todo-item {
            display: flex;
            align-items: flex-start;
            gap: var(--space-2);
            padding: 3px var(--space-3) 3px calc(var(--space-3) + 12px);
            line-height: 1.5;
          }
          .todo-icon {
            flex-shrink: 0;
            width: 14px;
            text-align: center;
            font-size: 10px;
            margin-top: 2px;
          }
          .todo-icon-completed {
            color: var(--accent-green);
            font-weight: 700;
          }
          .todo-icon-in_progress {
            color: var(--accent-blue);
          }
          .todo-icon-pending {
            color: var(--text-disabled);
          }
          .todo-content {
            color: var(--text-secondary);
          }
          .todo-completed .todo-content {
            color: var(--text-disabled);
            text-decoration: line-through;
          }
          .todo-in_progress .todo-content {
            color: var(--text-primary);
            font-weight: 500;
          }
        `}</style>
      </div>
    </Show>
  );
}
