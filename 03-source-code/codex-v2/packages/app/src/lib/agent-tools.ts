// ============================================================================
// CodeEX v2 — Ageixt Mode Tools
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Tool definitions and executor for Gixsis ageixt mode.
// Tools allow Gixsis to read files, edit files, run commands, and search.
// All operations route through the IFileSystem abstraction.
// ============================================================================

import { getFS } from "./filesystem";
import { streamChat } from "./terraforge-client";
import { isMCPTool, getMCPToolDefs, executeMCPTool } from "./mcp-tools";
import type { FileNode, TodoItem } from "./types";

/** Current model for ageixt and sub-ageixt use. Set from ChatPanel. */
let currentModel = "gixsis-v4.0.1";

/** Set the current model (called from ChatPanel when model changes). */
export function setAgeixtModel(model: string): void {
  currentModel = model;
}

/** Current ageixt todo list — updated via the todo_write tool. */
let currentTodos: TodoItem[] = [];

/** Get the current todo list. */
export function getAgeixtTodos(): TodoItem[] {
  return currentTodos;
}

/** Clear the todo list (e.g., on new conversation). */
export function clearAgeixtTodos(): void {
  currentTodos = [];
  document.dispatchEvent(new CustomEvent("codex:todo-updated", { detail: { todos: [] } }));
}

/** Patterns that identify destructive shell commands requiring user approval. */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-z]*r|-[a-z]*f|--recursive|--force)/i,
  /\brmdir\b/i,
  /\bgit\s+push\s+.*--force/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bgit\s+branch\s+-[a-z]*D\b/i,
  /\bdrop\s+(table|database|schema|index)/i,
  /\bdelete\s+from\b/i,
  /\btruncate\s+table/i,
  /\bkill\s+-9/i,
  /\bpkill\s+-9/i,
  /\bsystemctl\s+(stop|disable|mask)\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bchmod\s+000/i,
  /\bnpm\s+unpublish\b/i,
  /\bcargo\s+publish\b/i,
];

/**
 * Check if a tool call involves a destructive/dangerous operation that
 * requires explicit user approval before execution.
 * Returns a human-readable description of the risk, or null if safe.
 */
export function checkDestructive(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  if (toolName === "run_command" || toolName === "grep_files" || toolName === "glob_files") {
    const cmd = String(input.command ?? input.pattern ?? "");
    // Only run_command commands are actually dangerous
    if (toolName !== "run_command") return null;
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(cmd)) {
        return cmd;
      }
    }
  }
  return null;
}

/** Max output length (characters) before truncation — keeps context window manageable. */
const MAX_OUTPUT_CHARS = 30_000;
/** Default command timeout in milliseconds (30 seconds). */
const COMMAND_TIMEOUT_MS = 30_000;

/** Truncate output if it exceeds MAX_OUTPUT_CHARS, preserving head and tail. */
function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const headSize = Math.floor(MAX_OUTPUT_CHARS * 0.7);
  const tailSize = Math.floor(MAX_OUTPUT_CHARS * 0.25);
  const omitted = output.length - headSize - tailSize;
  return output.slice(0, headSize) + `\n\n... [${omitted} characters truncated] ...\n\n` + output.slice(-tailSize);
}

/** Run a TerraRuntime command with timeout. Rejects on timeout. */
async function invokeWithTimeout(command: string, cwd?: string): Promise<string> {
  const terraRuntime = (window as any).__TAURI__;
  if (!terraRuntime?.core?.invoke) {
    throw new Error("TerraRuntime not available — run_command requires desktop mode.");
  }
  const result = await Promise.race([
    terraRuntime.core.invoke("run_command", { command, cwd }) as Promise<string>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`)), COMMAND_TIMEOUT_MS)
    ),
  ]);
  return truncateOutput(result);
}

/** Tool definition schema (sent to the model). */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

/** Result of executing a tool. */
export interface ToolResult {
  toolCallId: string;
  name: string;
  output: string;
  status: "success" | "error";
  /** For edit tools, carries the diff payload for DiffViewer. */
  diff?: { fileName: string; oldContent: string; newContent: string };
}

/** The tools Gixsis can call in ageixt mode. */
export const ageixtTools: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the contents of a file by path. Returns the full file content.",
    parameters: {
      path: { type: "string", description: "The file path to read", required: true },
    },
  },
  {
    name: "edit_file",
    description: "Propose an edit to a file. Replaces old_text with new_text. The user will see a diff and can accept or reject.",
    parameters: {
      path: { type: "string", description: "The file path to edit", required: true },
      old_text: { type: "string", description: "The exact text to find and replace", required: true },
      new_text: { type: "string", description: "The replacement text", required: true },
    },
  },
  {
    name: "create_file",
    description: "Create a new file with the given content. The user will see the content and can accept or reject.",
    parameters: {
      path: { type: "string", description: "The file path to create", required: true },
      content: { type: "string", description: "The file content", required: true },
    },
  },
  {
    name: "search_files",
    description: "Search for a text pattern across all files. Returns matching lines with file paths and line numbers.",
    parameters: {
      query: { type: "string", description: "The search text or pattern", required: true },
    },
  },
  {
    name: "list_files",
    description: "List all available files in the workspace.",
    parameters: {},
  },
  {
    name: "run_command",
    description: "Run a shell command in the terminal. Only available in desktop mode with TerraRuntime.",
    parameters: {
      command: { type: "string", description: "The shell command to execute", required: true },
      cwd: { type: "string", description: "Working directory for the command (optional)" },
    },
  },
  {
    name: "grep_files",
    description: "Search for a regex pattern across files. Returns matching lines with file paths and line numbers. More powerful than search_files — supports regular expressions and file type filtering.",
    parameters: {
      pattern: { type: "string", description: "The regex pattern to search for", required: true },
      glob: { type: "string", description: "File glob pattern to filter (e.g. '*.ts', '*.rs'). Optional." },
      path: { type: "string", description: "Directory to search in. Defaults to workspace root." },
    },
  },
  {
    name: "glob_files",
    description: "Find files matching a glob pattern. Returns file paths sorted by name. Use for discovering files by name pattern.",
    parameters: {
      pattern: { type: "string", description: "The glob pattern to match (e.g. 'src/**/*.tsx', '*.json', '**/test*')", required: true },
      path: { type: "string", description: "Base directory to search from. Defaults to workspace root." },
    },
  },
  {
    name: "git_status",
    description: "Show the working tree status: staged changes, unstaged changes, and untracked files. Only available in desktop mode.",
    parameters: {},
  },
  {
    name: "git_diff",
    description: "Show diff of changes in the working directory. Shows unstaged changes by default, or staged changes with the staged parameter.",
    parameters: {
      staged: { type: "boolean", description: "If true, show staged (cached) changes instead of unstaged" },
      file: { type: "string", description: "Specific file to diff (optional, defaults to all changes)" },
    },
  },
  {
    name: "git_log",
    description: "Show recent git commit history with short format. Returns the last N commits.",
    parameters: {
      count: { type: "number", description: "Number of commits to show (default: 10)" },
    },
  },
  {
    name: "todo_write",
    description: "Create or update a structured task list to track progress on multi-step work. Each todo has a content (imperative: 'Fix bug'), status (pending/in_progress/completed), and activeForm (present continuous: 'Fixing bug'). The full list is replaced each call.",
    parameters: {
      todos: { type: "array", description: 'JSON array of {content: string, status: "pending"|"in_progress"|"completed", activeForm: string}', required: true },
    },
  },
  {
    name: "delegate_task",
    description: "Spawn a focused sub-ageixt to perform research or exploration. The sub-ageixt has read-only access to files (read_file, search_files, list_files, grep_files, glob_files) and runs autonomously for up to 5 turns. Returns the sub-ageixt's findings. Use this for codebase exploration, searching for patterns, or gathering information while you continue with other work.",
    parameters: {
      description: { type: "string", description: "Short (3-5 word) summary of what the sub-ageixt will do", required: true },
      prompt: { type: "string", description: "Detailed task description for the sub-ageixt. Be specific about what to search for or investigate.", required: true },
    },
  },
];

/** Get all available tools: local + MCP (if connected). */
export function getAgeixtTools(): ToolDef[] {
  return [...ageixtTools, ...getMCPToolDefs()];
}

/** Execute a tool call against the current workspace via filesystem abstraction. */
export async function executeTool(
  toolCallId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const fs = getFS();

  switch (name) {
    case "read_file": {
      const path = String(input.path ?? "");
      try {
        const content = await fs.readFile(path);
        return { toolCallId, name, output: content, status: "success" };
      } catch {
        return { toolCallId, name, output: `Error: File not found: ${path}`, status: "error" };
      }
    }

    case "edit_file": {
      const path = String(input.path ?? "");
      const oldText = String(input.old_text ?? "");
      const newText = String(input.new_text ?? "");
      try {
        const content = await fs.readFile(path);
        if (!content.includes(oldText)) {
          return { toolCallId, name, output: `Error: old_text not found in ${path}`, status: "error" };
        }
        const newContent = content.replace(oldText, newText);
        return {
          toolCallId,
          name,
          output: `Proposed edit to ${path} (${oldText.split("\n").length} lines → ${newText.split("\n").length} lines)`,
          status: "success",
          diff: { fileName: path, oldContent: content, newContent },
        };
      } catch {
        return { toolCallId, name, output: `Error: File not found: ${path}`, status: "error" };
      }
    }

    case "create_file": {
      const path = String(input.path ?? "");
      const content = String(input.content ?? "");
      try {
        const exists = await fs.exists(path);
        if (exists) {
          return { toolCallId, name, output: `Error: File already exists: ${path}. Use edit_file instead.`, status: "error" };
        }
      } catch {
        // If exists check fails, proceed anyway
      }
      return {
        toolCallId,
        name,
        output: `Proposed new file: ${path} (${content.split("\n").length} lines)`,
        status: "success",
        diff: { fileName: path, oldContent: "", newContent: content },
      };
    }

    case "search_files": {
      const query = String(input.query ?? "");
      if (!query || query.length < 2) {
        return { toolCallId, name, output: "Error: Query must be at least 2 characters", status: "error" };
      }
      try {
        const matchMap = await fs.searchFiles(query, { maxResults: 50 });
        if (matchMap.size === 0) {
          return { toolCallId, name, output: `No matches found for "${query}"`, status: "success" };
        }
        const results: string[] = [];
        for (const [file, matches] of matchMap) {
          for (const m of matches) {
            results.push(`${file}:${m.line}: ${m.text.trim()}`);
          }
        }
        return { toolCallId, name, output: `${results.length} matches:\n${results.slice(0, 50).join("\n")}`, status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error searching: ${err.message}`, status: "error" };
      }
    }

    case "list_files": {
      try {
        const tree = await fs.readDir("", 3);
        const paths: string[] = [];
        const walk = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.type === "file") paths.push(node.path);
            else if (node.children) walk(node.children);
          }
        };
        walk(tree);
        return { toolCallId, name, output: paths.join("\n") || "(empty workspace)", status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error listing files: ${err.message}`, status: "error" };
      }
    }

    case "run_command": {
      try {
        const command = String(input.command ?? "");
        const cwd = input.cwd ? String(input.cwd) : undefined;
        const output = await invokeWithTimeout(command, cwd);
        return { toolCallId, name, output: output || "(no output)", status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
      }
    }

    case "grep_files": {
      const pattern = String(input.pattern ?? "");
      if (!pattern) {
        return { toolCallId, name, output: "Error: pattern is required", status: "error" };
      }
      const hasTR = !!(window as any).__TAURI__?.core?.invoke;
      if (hasTR) {
        try {
          const glob = input.glob ? `--glob '${String(input.glob)}'` : "";
          const searchPath = input.path ? String(input.path) : ".";
          const cmd = `rg -n --max-count 100 ${glob} '${pattern.replace(/'/g, "'\\''")}' ${searchPath} 2>/dev/null || grep -rn --include='${String(input.glob || "*")}' '${pattern.replace(/'/g, "'\\''")}' ${searchPath} 2>/dev/null | head -100`;
          const output = await invokeWithTimeout(cmd);
          return { toolCallId, name, output: output || `No matches found for pattern: ${pattern}`, status: "success" };
        } catch (err: any) {
          return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
        }
      }
      // Fallback to filesystem search for browser mode
      try {
        const matchMap = await fs.searchFiles(pattern, { maxResults: 100 });
        if (matchMap.size === 0) {
          return { toolCallId, name, output: `No matches found for "${pattern}"`, status: "success" };
        }
        const results: string[] = [];
        for (const [file, matches] of matchMap) {
          for (const m of matches) {
            results.push(`${file}:${m.line}: ${m.text.trim()}`);
          }
        }
        return { toolCallId, name, output: `${results.length} matches:\n${results.join("\n")}`, status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message}`, status: "error" };
      }
    }

    case "glob_files": {
      const pattern = String(input.pattern ?? "");
      if (!pattern) {
        return { toolCallId, name, output: "Error: pattern is required", status: "error" };
      }
      const hasTR2 = !!(window as any).__TAURI__?.core?.invoke;
      if (hasTR2) {
        try {
          const basePath = input.path ? String(input.path) : ".";
          const cmd = `find ${basePath} -name '${pattern.replace(/'/g, "'\\''")}' -type f 2>/dev/null | head -200 || powershell -NoProfile -Command "Get-ChildItem -Path '${basePath}' -Filter '${pattern}' -Recurse -File | Select-Object -First 200 | ForEach-Object { $_.FullName }"`;
          const output = await invokeWithTimeout(cmd);
          return { toolCallId, name, output: output || `No files matching: ${pattern}`, status: "success" };
        } catch (err: any) {
          return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
        }
      }
      // Fallback: use list_files and filter
      try {
        const tree = await fs.readDir("", 5);
        const paths: string[] = [];
        const walk = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.type === "file") paths.push(node.path);
            else if (node.children) walk(node.children);
          }
        };
        walk(tree);
        const globToRegex = (g: string) => new RegExp("^" + g.replace(/\*\*/g, "___DSTAR___").replace(/\*/g, "[^/]*").replace(/___DSTAR___/g, ".*").replace(/\?/g, ".") + "$");
        const re = globToRegex(pattern);
        const matched = paths.filter((p) => re.test(p) || re.test(p.split("/").pop() ?? ""));
        return { toolCallId, name, output: matched.length > 0 ? matched.join("\n") : `No files matching: ${pattern}`, status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message}`, status: "error" };
      }
    }

    case "git_status": {
      try {
        const output = await invokeWithTimeout("git status --short --branch");
        return { toolCallId, name, output: output || "(clean working tree)", status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
      }
    }

    case "git_diff": {
      try {
        const staged = input.staged ? " --cached" : "";
        const file = input.file ? ` -- ${String(input.file)}` : "";
        const output = await invokeWithTimeout(`git diff${staged}${file}`);
        return { toolCallId, name, output: output || "(no changes)", status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
      }
    }

    case "git_log": {
      try {
        const count = Number(input.count) || 10;
        const output = await invokeWithTimeout(`git log --oneline --decorate -n ${count}`);
        return { toolCallId, name, output: output || "(no commits)", status: "success" };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
      }
    }

    case "todo_write": {
      try {
        const todosInput = input.todos;
        if (!Array.isArray(todosInput)) {
          return { toolCallId, name, output: "Error: todos must be an array", status: "error" };
        }
        const validStatuses = new Set(["pending", "in_progress", "completed"]);
        const todos: TodoItem[] = todosInput
          .filter((t: any) => t && typeof t.content === "string" && validStatuses.has(t.status))
          .map((t: any) => ({
            content: String(t.content),
            status: t.status as TodoItem["status"],
            activeForm: String(t.activeForm || t.content),
          }));
        currentTodos = todos;
        document.dispatchEvent(new CustomEvent("codex:todo-updated", { detail: { todos } }));
        const completed = todos.filter((t) => t.status === "completed").length;
        const inProgress = todos.filter((t) => t.status === "in_progress").length;
        const pending = todos.filter((t) => t.status === "pending").length;
        return {
          toolCallId,
          name,
          output: `Todo list updated: ${completed} completed, ${inProgress} in progress, ${pending} pending (${todos.length} total)`,
          status: "success",
        };
      } catch (err: any) {
        return { toolCallId, name, output: `Error: ${err.message || err}`, status: "error" };
      }
    }

    case "delegate_task": {
      const description = String(input.description ?? "Sub-ageixt task");
      const prompt = String(input.prompt ?? "");
      if (!prompt) {
        return { toolCallId, name, output: "Error: prompt is required", status: "error" };
      }

      document.dispatchEvent(new CustomEvent("codex:subagent-status", { detail: { status: "running", description } }));

      try {
        // Read-only tools for sub-ageixt
        const readOnlyTools: ToolDef[] = ageixtTools.filter((t) =>
          ["read_file", "search_files", "list_files", "grep_files", "glob_files"].includes(t.name)
        );
        const toolDescriptions = readOnlyTools
          .map((t) => {
            const params = Object.entries(t.parameters)
              .map(([k, v]) => `  - ${k} (${v.type}${v.required ? ", required" : ""}): ${v.description}`)
              .join("\n");
            return `### ${t.name}\n${t.description}\n${params ? `Parameters:\n${params}` : "No parameters."}`;
          })
          .join("\n\n");

        const subAgeixtSystem = `You are a focused research sub-ageixt for Gixsis. You have read-only access to the codebase.

Your task: ${prompt}

You have access to these tools (read-only). To use a tool, respond with:

\`\`\`tool_call
{"name": "tool_name", "input": {"param1": "value1"}}
\`\`\`

Available tools:

${toolDescriptions}

Important:
- You have a maximum of 5 turns. Be efficient.
- Focus specifically on the task described above.
- Provide a clear, concise final summary of your findings.
- Do NOT attempt to edit, create, or delete files.`;

        let turnHistory: { role: string; content: string }[] = [
          { role: "system", content: subAgeixtSystem },
          { role: "user", content: prompt },
        ];

        const MAX_SUB_TURNS = 5;
        let lastContent = "";

        for (let turn = 0; turn < MAX_SUB_TURNS; turn++) {
          let fullContent = "";
          for await (const chunk of streamChat(currentModel, turnHistory)) {
            fullContent += chunk;
          }

          lastContent = fullContent;

          // Parse tool calls
          const calls = parseToolCalls(fullContent);
          if (calls.length === 0) break;

          // Execute read-only tool calls only
          const results: string[] = [];
          for (const call of calls) {
            if (!["read_file", "search_files", "list_files", "grep_files", "glob_files"].includes(call.name)) {
              results.push(`[Tool: ${call.name}] BLOCKED: Sub-ageixts have read-only access.`);
              continue;
            }
            const cid = crypto.randomUUID();
            const result = await executeTool(cid, call.name, call.input);
            results.push(`[Tool: ${call.name}] ${result.status}: ${result.output}`);
          }

          turnHistory = [
            ...turnHistory,
            { role: "assistant", content: fullContent },
            { role: "user", content: `[Tool Results]\n\n${results.join("\n\n")}\n\nContinue your research. Provide findings when done.` },
          ];
        }

        document.dispatchEvent(new CustomEvent("codex:subagent-status", { detail: { status: "complete", description } }));

        // Strip tool_call blocks from the final response for cleaner output
        const cleanOutput = lastContent.replace(/```tool_call\s*\n[\s\S]*?```/g, "").trim();
        return {
          toolCallId,
          name,
          output: `[Sub-ageixt: ${description}]\n\n${truncateOutput(cleanOutput)}`,
          status: "success",
        };
      } catch (err: any) {
        document.dispatchEvent(new CustomEvent("codex:subagent-status", { detail: { status: "error", description } }));
        return { toolCallId, name, output: `Error: Sub-ageixt failed — ${err.message || err}`, status: "error" };
      }
    }

    default:
      // Delegate MCP-prefixed tools to the MCP bridge
      if (isMCPTool(name)) {
        return executeMCPTool(toolCallId, name, input);
      }
      return { toolCallId, name, output: `Error: Unknown tool: ${name}`, status: "error" };
  }
}

/** Apply an accepted edit to the filesystem. */
export async function applyEdit(path: string, newContent: string): Promise<void> {
  await getFS().writeFile(path, newContent);
}

/** Build the system prompt for ageixt mode with tool descriptions. */
export function buildAgeixtSystemPrompt(basePrompt: string): string {
  const toolDescriptions = getAgeixtTools()
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(([k, v]) => `  - ${k} (${v.type}${v.required ? ", required" : ""}): ${v.description}`)
        .join("\n");
      return `### ${t.name}\n${t.description}\n${params ? `Parameters:\n${params}` : "No parameters."}`;
    })
    .join("\n\n");

  return `${basePrompt}

## Ageixt Mode

You have access to the following tools. To use a tool, respond with a JSON block in this exact format:

\`\`\`tool_call
{"name": "tool_name", "input": {"param1": "value1"}}
\`\`\`

You can include multiple tool_call blocks in a single response. Always explain what you're doing before and after tool calls.

Available tools:

${toolDescriptions}

Important:
- Always read a file before editing it.
- For edits, use exact string matching — old_text must appear exactly in the file.
- Explain your reasoning. Don't just call tools silently.
- After edits, summarize what changed and why.`;
}

/** Parse tool call blocks from a streamed response. */
export function parseToolCalls(text: string): { name: string; input: Record<string, unknown> }[] {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const regex = /```tool_call\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && typeof parsed.name === "string") {
        calls.push({ name: parsed.name, input: parsed.input ?? {} });
      }
    } catch {
      // Skip malformed tool calls
    }
  }
  return calls;
}
