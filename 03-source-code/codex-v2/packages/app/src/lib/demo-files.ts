// ============================================================================
// CodeEX v2 — Demo File Contents (Shared)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Shared demo file content map used by EditorArea and Search.
// Will be replaced with real FS reads via TerraRuntime.
// ============================================================================

export const demoFiles: Record<string, string> = {
  "src/index.tsx": `import { render } from "solid-js/web";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
`,
  "src/App.tsx": `import { createSignal } from "solid-js";

export function App() {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <h1>CodeEX v2</h1>
      <p>Sovereign IDE by TerraTech Systems</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Count: {count()}
      </button>
    </div>
  );
}
`,
  "src/lib/types.ts": `export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}
`,
  "package.json": `{
  "name": "codex-v2",
  "version": "0.1.0",
  "description": "CodeEX v2 — Sovereign IDE by TerraTech Systems",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3100",
    "build": "vite build"
  }
}
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true
  },
  "include": ["src"]
}
`,
  "README.md": `# CodeEX v2

Sovereign IDE by TerraTech Systems.

## Stack
- SolidJS (reactive UI)
- CodeMirror 6 (editor)
- TerraRuntime (desktop)
- TerraForge Engine (AI — Gixsis)

## Shortcuts
- Ctrl+Shift+P — Command Palette
- Ctrl+B — Toggle Sidebar
- Ctrl+\` — Toggle Terminal
- Ctrl+Escape — Focus Gixsis Chat
`,
};

/** Search across all demo files. Returns matches grouped by file. */
export interface SearchMatch {
  file: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export function searchFiles(query: string, caseSensitive = false): Map<string, SearchMatch[]> {
  const results = new Map<string, SearchMatch[]>();
  if (!query || query.length < 2) return results;

  const needle = caseSensitive ? query : query.toLowerCase();

  for (const [file, content] of Object.entries(demoFiles)) {
    const lines = content.split("\n");
    const matches: SearchMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const haystack = caseSensitive ? line : line.toLowerCase();
      let searchFrom = 0;

      while (true) {
        const idx = haystack.indexOf(needle, searchFrom);
        if (idx === -1) break;
        matches.push({
          file,
          line: i + 1,
          text: line,
          matchStart: idx,
          matchEnd: idx + query.length,
        });
        searchFrom = idx + 1;
      }
    }

    if (matches.length > 0) {
      results.set(file, matches);
    }
  }

  return results;
}
