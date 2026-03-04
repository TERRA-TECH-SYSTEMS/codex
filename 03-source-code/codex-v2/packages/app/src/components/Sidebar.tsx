// ============================================================================
// CodeEX v2 — Sidebar (File Explorer, Search, Git, Extensions)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, createMemo, createEffect, createResource, Show, For, onMount, onCleanup } from "solid-js";
import { getFS, upgradeToBrowserFS, isFSAccessAvailable, getCurrentBackend, getRootName } from "~/lib/filesystem";
import type { SearchMatch } from "~/lib/filesystem";
import { getFileIcon, FOLDER_ICON, FOLDER_OPEN_ICON } from "~/lib/file-icons";
import { notify } from "~/lib/notifications";
import { ContextMenu } from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";
import type { PanelView, FileNode } from "~/lib/types";
import { getExtensions, enableExtension, disableExtension, uninstallExtension, onExtensionsChanged, searchMarketplace, getFeaturedExtensions, getMarketplaceCategories, installFromMarketplace, isMarketplaceInstalled, type ExtensionState, type MarketplaceExtension, type MarketplaceCategory } from "~/lib/extension-registry";
import { testFiles, isRunning, selectedRunner, lastSummary, testError, setRunner, discoverTests, runAllTests, runTestFile, getStatusIcon, getFileStats, type TestFile, type TestRunner } from "~/lib/test-runner";
import { getLspClient, type LspDocumentSymbol } from "~/lib/lsp-client";
import { updateGitChanges } from "~/lib/git-status-store";
import { LoadingSpinner } from "./LoadingSpinner";

interface Props {
  activePanel: PanelView;
  activeFile?: string | null;
  openFiles?: string[];
  onOpenFile: (path: string) => void;
  onCloseFile?: (path: string) => void;
}

interface FileSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "enum" | "method" | "property";
  line: number;
}

/** Parse file content for symbols (functions, classes, interfaces, types, etc.) */
function parseSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const patterns: { regex: RegExp; kind: FileSymbol["kind"] }[] = [
    { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { regex: /^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/, kind: "class" },
    { regex: /^\s*(?:export\s+)?interface\s+(\w+)/, kind: "interface" },
    { regex: /^\s*(?:export\s+)?type\s+(\w+)\s*=/, kind: "type" },
    { regex: /^\s*(?:export\s+)?enum\s+(\w+)/, kind: "enum" },
    { regex: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/, kind: "function" },
    { regex: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/, kind: "function" },
    { regex: /^\s*(?:export\s+)?(?:let|const|var)\s+(\w+)\s*[:=]/, kind: "variable" },
    { regex: /^\s*(?:public|private|protected|static|async)\s+(\w+)\s*\(/, kind: "method" },
    { regex: /^\s*def\s+(\w+)\s*\(/, kind: "function" },
    { regex: /^\s*fn\s+(\w+)\s*[(<]/, kind: "function" },
    { regex: /^\s*(?:pub\s+)?struct\s+(\w+)/, kind: "class" },
    { regex: /^\s*(?:pub\s+)?enum\s+(\w+)/, kind: "enum" },
    { regex: /^\s*(?:pub\s+)?trait\s+(\w+)/, kind: "interface" },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const { regex, kind } of patterns) {
      const match = regex.exec(lines[i]);
      if (match) {
        symbols.push({ name: match[1], kind, line: i + 1 });
        break;
      }
    }
  }
  return symbols;
}

const SYMBOL_ICONS: Record<FileSymbol["kind"], { icon: string; color: string }> = {
  function: { icon: "f", color: "var(--accent-blue)" },
  class: { icon: "C", color: "var(--accent-orange)" },
  interface: { icon: "I", color: "var(--accent-teal, #64d2ff)" },
  type: { icon: "T", color: "var(--accent-teal, #64d2ff)" },
  variable: { icon: "v", color: "var(--text-secondary)" },
  enum: { icon: "E", color: "var(--accent-orange)" },
  method: { icon: "m", color: "var(--accent-blue)" },
  property: { icon: "p", color: "var(--text-secondary)" },
};

/** Outline symbol with optional children for hierarchical display. */
interface OutlineSymbol {
  name: string;
  kind: FileSymbol["kind"];
  line: number;
  endLine?: number;
  detail?: string;
  children?: OutlineSymbol[];
}

/** Map LSP SymbolKind number to our kind string. */
function lspKindToKind(kind: number): FileSymbol["kind"] {
  switch (kind) {
    case 5: return "class"; // Class
    case 6: return "method"; // Method
    case 7: return "property"; // Property
    case 8: return "property"; // Field
    case 9: return "function"; // Constructor
    case 10: return "enum"; // Enum
    case 11: return "interface"; // Interface
    case 12: return "function"; // Function
    case 13: return "variable"; // Variable
    case 14: return "variable"; // Constant
    case 23: return "class"; // Struct
    case 26: return "type"; // TypeParameter
    default: return "variable";
  }
}

/** Convert LSP DocumentSymbol tree to OutlineSymbol tree. */
function lspToOutline(syms: LspDocumentSymbol[]): OutlineSymbol[] {
  return syms.map(s => ({
    name: s.name,
    kind: lspKindToKind(s.kind),
    line: s.selectionRange.start.line + 1,
    endLine: s.range.end.line + 1,
    detail: s.detail,
    children: s.children?.length ? lspToOutline(s.children) : undefined,
  }));
}

/** Convert flat FileSymbol[] to OutlineSymbol[] (no children). */
function flatToOutline(syms: FileSymbol[]): OutlineSymbol[] {
  return syms.map(s => ({ name: s.name, kind: s.kind, line: s.line }));
}

/** Count all symbols including children. */
function countSymbols(syms: OutlineSymbol[]): number {
  let n = syms.length;
  for (const s of syms) if (s.children) n += countSymbols(s.children);
  return n;
}

/** Flatten outline tree for sort/filter. */
function flattenOutline(syms: OutlineSymbol[]): OutlineSymbol[] {
  const result: OutlineSymbol[] = [];
  for (const s of syms) {
    result.push(s);
    if (s.children) result.push(...flattenOutline(s.children));
  }
  return result;
}

type OutlineSortMode = "position" | "name" | "kind";

function sortOutline(syms: OutlineSymbol[], mode: OutlineSortMode): OutlineSymbol[] {
  const sorted = [...syms];
  switch (mode) {
    case "name": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "kind": sorted.sort((a, b) => a.kind.localeCompare(b.kind) || a.line - b.line); break;
    default: sorted.sort((a, b) => a.line - b.line); break;
  }
  // Recursively sort children
  for (const s of sorted) {
    if (s.children) s.children = sortOutline(s.children, mode);
  }
  return sorted;
}

// demoTree removed — file tree now loaded from getFS().readDir()

/**
 * Compact folders: when a directory has exactly one child that is also a
 * directory, collapse them into a single display row (e.g. "src/components").
 * Chains recursively so a/b/c with single-child dirs becomes one row.
 */
function getCompactedNode(node: FileNode): { displayName: string; effectiveChildren: FileNode[] | undefined; leafNode: FileNode } {
  let current = node;
  let displayName = node.name;
  while (
    current.type === "directory" &&
    current.children?.length === 1 &&
    current.children[0].type === "directory"
  ) {
    current = current.children[0];
    displayName += "/" + current.name;
  }
  return { displayName, effectiveChildren: current.children, leafNode: current };
}

function FileTreeNode(props: {
  node: FileNode;
  depth: number;
  onOpenFile: (path: string) => void;
  onContextMenu?: (e: MouseEvent, node: FileNode) => void;
  editingPath?: string | null;
  onEditDone?: (oldPath: string, newName: string) => void;
  onEditCancel?: () => void;
  creatingIn?: { path: string; type: "file" | "folder" } | null;
  onCreateDone?: (parentPath: string, name: string, type: "file" | "folder") => void;
  onCreateCancel?: () => void;
  dragOverPath?: string | null;
  onDragMove?: (sourcePath: string, targetDir: string) => void;
  onDragOverChange?: (path: string | null) => void;
  gitChanges?: { path: string; status: string }[];
  gitStaged?: { path: string; status: string }[];
}) {
  const [expanded, setExpanded] = createSignal(props.node.expanded ?? true);

  // Compact single-child directory chains into one display row
  const compacted = createMemo(() =>
    props.node.type === "directory" ? getCompactedNode(props.node) : null
  );
  const displayName = () => compacted()?.displayName ?? props.node.name;
  const effectiveChildren = () => compacted()?.effectiveChildren ?? props.node.children;
  const leafPath = () => compacted()?.leafNode.path ?? props.node.path;

  // Auto-expand directory when creating inside it (check both original and leaf paths)
  createEffect(() => {
    const creating = props.creatingIn?.path;
    if (creating === props.node.path || creating === leafPath()) setExpanded(true);
  });

  const handleClick = () => {
    if (props.node.type === "directory") {
      setExpanded((v) => !v);
    } else {
      props.onOpenFile(props.node.path);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.onContextMenu?.(e, props.node);
  };

  const iconSVG = () => {
    if (props.node.type === "directory") {
      const fi = expanded() ? FOLDER_OPEN_ICON : FOLDER_ICON;
      return `<svg width="14" height="14" viewBox="0 0 16 16" fill="${fi.color}" xmlns="http://www.w3.org/2000/svg"><path d="${fi.path}"/></svg>`;
    }
    const fi = getFileIcon(props.node.name);
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="${fi.color}" xmlns="http://www.w3.org/2000/svg"><path d="${fi.path}"/></svg>`;
  };

  // --- Git status decoration ---
  const gitDecoration = createMemo((): { badge: string; badgeColor: string; nameColor: string } | null => {
    const changes = props.gitChanges;
    const staged = props.gitStaged;
    if ((!changes || changes.length === 0) && (!staged || staged.length === 0)) return null;

    const nodePath = props.node.path;
    const isDir = props.node.type === "directory";

    // For files: exact match. For directories: check if any entry starts with dir path + "/"
    const matchPath = (entry: { path: string; status: string }) => {
      if (isDir) {
        return entry.path === nodePath || entry.path.startsWith(nodePath + "/");
      }
      return entry.path === nodePath;
    };

    // Check staged first (staged takes display priority for badge)
    const stagedEntry = staged?.find(matchPath);
    if (stagedEntry) {
      const st = stagedEntry.status;
      if (st === "D") return { badge: "D", badgeColor: "#f14c4c", nameColor: "#f14c4c" };
      if (st === "A") return { badge: "A", badgeColor: "#89d185", nameColor: "#89d185" };
      // M, R, C or other staged status
      return { badge: "S", badgeColor: "#89d185", nameColor: "#89d185" };
    }

    // Check unstaged changes
    const changeEntry = changes?.find(matchPath);
    if (changeEntry) {
      const st = changeEntry.status;
      if (st === "U") return { badge: "U", badgeColor: "#73c991", nameColor: "#73c991" };
      if (st === "D") return { badge: "D", badgeColor: "#f14c4c", nameColor: "#f14c4c" };
      // M or other working-tree modification
      return { badge: "M", badgeColor: "#e2b93d", nameColor: "#e2b93d" };
    }

    // For directories: if any descendant has changes, show a subtle indicator
    if (isDir) {
      const hasDescendantChange = changes?.some(matchPath) || staged?.some(matchPath);
      if (hasDescendantChange) {
        return { badge: "", badgeColor: "", nameColor: "var(--text-secondary)" };
      }
    }

    return null;
  });

  return (
    <>
      <div
        class={`tree-node ${props.node.type}${props.dragOverPath === props.node.path ? " drag-over" : ""}`}
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={true}
        onDragStart={(e) => {
          e.dataTransfer!.setData("text/plain", props.node.path);
          e.dataTransfer!.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = "move";
          const target = props.node.type === "directory" ? props.node.path : props.node.path.split("/").slice(0, -1).join("/");
          props.onDragOverChange?.(target || props.node.path);
        }}
        onDragLeave={() => props.onDragOverChange?.(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const sourcePath = e.dataTransfer!.getData("text/plain");
          if (!sourcePath || sourcePath === props.node.path) return;
          const targetDir = props.node.type === "directory" ? props.node.path : props.node.path.split("/").slice(0, -1).join("/");
          props.onDragMove?.(sourcePath, targetDir);
          props.onDragOverChange?.(null);
        }}
        onDragEnd={() => props.onDragOverChange?.(null)}
      >
        <Show when={props.node.type === "directory"}>
          <span class="tree-arrow" style={{ transform: expanded() ? "rotate(90deg)" : "rotate(0deg)" }}>
            &#9654;
          </span>
        </Show>
        <span class="tree-icon" innerHTML={iconSVG()} />
        <Show when={props.editingPath === props.node.path} fallback={
          <>
            <span class="tree-name truncate" style={gitDecoration()?.nameColor ? { color: gitDecoration()!.nameColor } : {}}>{displayName()}</span>
            <Show when={gitDecoration()?.badge}>
              <span class="git-badge" style={{ color: gitDecoration()!.badgeColor }}>{gitDecoration()!.badge}</span>
            </Show>
          </>
        }>
          <input
            class="tree-inline-input"
            value={props.node.name}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); props.onEditDone?.(props.node.path, e.currentTarget.value.trim()); }
              if (e.key === "Escape") props.onEditCancel?.();
            }}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              if (val && val !== props.node.name) props.onEditDone?.(props.node.path, val);
              else props.onEditCancel?.();
            }}
            ref={(el: HTMLInputElement) => requestAnimationFrame(() => { el.focus(); el.select(); })}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          />
        </Show>
      </div>
      <Show when={props.node.type === "directory" && (expanded() || props.creatingIn?.path === props.node.path || props.creatingIn?.path === leafPath()) && effectiveChildren()}>
        <Show when={props.creatingIn?.path === props.node.path || props.creatingIn?.path === leafPath()}>
          <div class="tree-node file" style={{ "padding-left": `${(props.depth + 1) * 16 + 8}px` }}>
            <span class="tree-icon" style={{ "font-size": "11px", width: "18px", "text-align": "center", color: "var(--accent-blue)" }}>+</span>
            <input
              class="tree-inline-input"
              placeholder={props.creatingIn?.type === "folder" ? "folder name" : "file name"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  e.preventDefault();
                  props.onCreateDone?.(leafPath(), e.currentTarget.value.trim(), props.creatingIn!.type);
                }
                if (e.key === "Escape") props.onCreateCancel?.();
              }}
              onBlur={(e) => {
                const val = e.currentTarget.value.trim();
                if (val) props.onCreateDone?.(leafPath(), val, props.creatingIn!.type);
                else props.onCreateCancel?.();
              }}
              ref={(el: HTMLInputElement) => requestAnimationFrame(() => el.focus())}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
        </Show>
        <For each={effectiveChildren()}>
          {(child) => <FileTreeNode node={child} depth={props.depth + 1} onOpenFile={props.onOpenFile} onContextMenu={props.onContextMenu} editingPath={props.editingPath} onEditDone={props.onEditDone} onEditCancel={props.onEditCancel} creatingIn={props.creatingIn} onCreateDone={props.onCreateDone} onCreateCancel={props.onCreateCancel} dragOverPath={props.dragOverPath} onDragMove={props.onDragMove} onDragOverChange={props.onDragOverChange} gitChanges={props.gitChanges} gitStaged={props.gitStaged} />}
        </For>
      </Show>
    </>
  );
}

/** Render a search match line with the matched portion highlighted. */
function HighlightedMatch(props: { match: SearchMatch; query: string }) {
  const before = () => props.match.text.substring(0, props.match.matchStart);
  const matched = () => props.match.text.substring(props.match.matchStart, props.match.matchEnd);
  const after = () => props.match.text.substring(props.match.matchEnd);

  return (
    <span class="match-text">
      {before()}<span class="match-highlight">{matched()}</span>{after()}
    </span>
  );
}

export function Sidebar(props: Props) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [replaceQuery, setReplaceQuery] = createSignal("");
  const [replaceExpanded, setReplaceExpanded] = createSignal(false);
  const [replacing, setReplacing] = createSignal(false);
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [wholeWord, setWholeWord] = createSignal(false);
  const [useRegex, setUseRegex] = createSignal(false);
  const [excludePattern, setExcludePattern] = createSignal("");
  const [includePattern, setIncludePattern] = createSignal("");
  const [showExclude, setShowExclude] = createSignal(false);
  const [expandedFiles, setExpandedFiles] = createSignal<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [outlineExpanded, setOutlineExpanded] = createSignal(true);
  const [editingPath, setEditingPath] = createSignal<string | null>(null);
  const [creatingIn, setCreatingIn] = createSignal<{ path: string; type: "file" | "folder" } | null>(null);
  const [treeDragOver, setTreeDragOver] = createSignal<string | null>(null);
  const [openEditorsExpanded, setOpenEditorsExpanded] = createSignal(true);
  const [treeFilterQuery, setTreeFilterQuery] = createSignal("");
  const [treeFilterVisible, setTreeFilterVisible] = createSignal(false);
  const [timelineExpanded, setTimelineExpanded] = createSignal(false);
  const [timelineEntries, setTimelineEntries] = createSignal<{ label: string; time: string; type: "save" | "edit" | "create" }[]>([]);

  // File tree from filesystem (replaces hardcoded demoTree)
  const [fsVersion, setFsVersion] = createSignal(0);
  const [workspaceRootName, setWorkspaceRootName] = createSignal<string | null>(null);
  const [rootExpanded, setRootExpanded] = createSignal(true);
  const [treeMounted, setTreeMounted] = createSignal(false);
  const [fileTree] = createResource(fsVersion, async () => {
    try {
      const tree = await getFS().readDir("", 4);
      setWorkspaceRootName(getRootName());
      // Trigger mount animation
      if (tree.length > 0 && !treeMounted()) {
        requestAnimationFrame(() => setTreeMounted(true));
      }
      return tree;
    } catch {
      return [];
    }
  });

  // Refresh file tree when filesystem backend changes (e.g. Open Folder from WelcomeTab)
  const handleFSChange = () => {
    setTreeMounted(false);
    setFsVersion((v) => v + 1);
  };
  onMount(() => window.addEventListener("codex-fs-change", handleFSChange));
  onCleanup(() => window.removeEventListener("codex-fs-change", handleFSChange));

  // Timeline: track file save events for local history
  const handleTimelineEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.path) return;
    const name = detail.path.split("/").pop() ?? detail.path;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setTimelineEntries((prev) => [
      { label: name, time, type: detail.type ?? "save" },
      ...prev.slice(0, 49),
    ]);
  };
  onMount(() => document.addEventListener("codex:file-saved", handleTimelineEvent));
  onCleanup(() => document.removeEventListener("codex:file-saved", handleTimelineEvent));

  // Filter file tree by name (Explorer filter)
  const filterTreeNodes = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes;
    const lq = query.toLowerCase();
    return nodes.reduce<FileNode[]>((acc, node) => {
      if (node.type === "directory") {
        const filteredChildren = filterTreeNodes(node.children ?? [], query);
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lq)) {
          acc.push({ ...node, children: filteredChildren, expanded: true });
        }
      } else if (node.name.toLowerCase().includes(lq)) {
        acc.push(node);
      }
      return acc;
    }, []);
  };
  // File nesting: group related files under parent (e.g., foo.test.ts under foo.ts)
  const nestingPatterns = [
    /^(.+)\.(test|spec)\.(ts|tsx|js|jsx)$/,   // test files
    /^(.+)\.(stories)\.(ts|tsx|js|jsx)$/,      // storybook
    /^(.+)\.(module)\.(css|scss|less)$/,        // CSS modules
    /^(.+)\.(d)\.(ts)$/,                        // type declarations
    /^(.+)\.(map)$/,                            // source maps
  ];
  const applyFileNesting = (nodes: FileNode[]): FileNode[] => {
    const files = nodes.filter((n) => n.type === "file");
    const dirs = nodes.filter((n) => n.type === "directory").map((d) => ({
      ...d,
      children: d.children ? applyFileNesting(d.children) : d.children,
    }));
    const nested = new Set<string>();
    const parentMap = new Map<string, FileNode[]>();
    for (const file of files) {
      for (const pattern of nestingPatterns) {
        const match = pattern.exec(file.name);
        if (match) {
          const baseName = match[1];
          const parentFile = files.find((f) => {
            const ext = f.name.slice(baseName.length);
            return f.name.startsWith(baseName) && /^\.(ts|tsx|js|jsx|css|scss|less)$/.test(ext);
          });
          if (parentFile && parentFile !== file) {
            nested.add(file.name);
            const arr = parentMap.get(parentFile.name) ?? [];
            arr.push(file);
            parentMap.set(parentFile.name, arr);
          }
          break;
        }
      }
    }
    const result: FileNode[] = [...dirs];
    for (const file of files) {
      if (nested.has(file.name)) continue;
      const children = parentMap.get(file.name);
      if (children) {
        result.push({ ...file, type: "directory", children, expanded: false });
      } else {
        result.push(file);
      }
    }
    return result;
  };

  const filteredFileTree = createMemo(() => {
    const q = treeFilterQuery();
    const tree = fileTree() ?? [];
    const filtered = q ? filterTreeNodes(tree, q) : tree;
    return applyFileNesting(filtered);
  });

  // Listen for toggle-replace event from Ctrl+Shift+H
  const handleToggleReplace = () => setReplaceExpanded(true);
  onMount(() => document.addEventListener("codex:toggle-replace", handleToggleReplace));
  onCleanup(() => document.removeEventListener("codex:toggle-replace", handleToggleReplace));

  // Parse symbols from active file — LSP first, regex fallback
  const [fileContent] = createResource(
    () => props.activeFile,
    async (file) => {
      if (!file) return "";
      try { return await getFS().readFile(file); } catch { return ""; }
    }
  );
  const [lspSymbols, setLspSymbols] = createSignal<OutlineSymbol[] | null>(null);
  const [outlineFilter, setOutlineFilter] = createSignal("");
  const [outlineSortMode, setOutlineSortMode] = createSignal<OutlineSortMode>("position");
  const [expandedOutlineNodes, setExpandedOutlineNodes] = createSignal<Set<string>>(new Set());

  // Fetch LSP symbols when active file changes
  createEffect(() => {
    const file = props.activeFile;
    if (!file) { setLspSymbols(null); return; }
    const client = getLspClient();
    if (client.supportsLanguage(file)) {
      client.documentSymbols(file).then(result => {
        if (result.length > 0) {
          setLspSymbols(lspToOutline(result));
        } else {
          setLspSymbols(null); // Fallback to regex
        }
      }).catch(() => setLspSymbols(null));
    } else {
      setLspSymbols(null);
    }
  });

  // Combined outline symbols: LSP if available, else regex
  const outlineSymbols = createMemo<OutlineSymbol[]>(() => {
    const lsp = lspSymbols();
    if (lsp && lsp.length > 0) return lsp;
    const content = fileContent();
    if (!content) return [];
    return flatToOutline(parseSymbols(content));
  });

  // Sorted and filtered outline
  const displayOutline = createMemo<OutlineSymbol[]>(() => {
    let syms = outlineSymbols();
    const filter = outlineFilter().toLowerCase();
    if (filter) {
      // Flatten, filter, return flat (no hierarchy when searching)
      syms = flattenOutline(syms).filter(s => s.name.toLowerCase().includes(filter));
      return sortOutline(syms.map(s => ({ ...s, children: undefined })), outlineSortMode());
    }
    return sortOutline(syms, outlineSortMode());
  });

  // Keep fileSymbols for backwards compatibility
  const fileSymbols = createMemo(() => {
    const content = fileContent();
    if (!content) return [];
    return parseSymbols(content);
  });

  async function handleRename(oldPath: string, newName: string) {
    if (!newName) { setEditingPath(null); return; }
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    if (oldPath === newPath) { setEditingPath(null); return; }
    try {
      await getFS().rename(oldPath, newPath);
      setEditingPath(null);
      setFsVersion((v) => v + 1);
    } catch (err: any) {
      notify({ type: "error", message: `Rename failed: ${err.message || err}` });
      setEditingPath(null);
    }
  }

  async function handleCreate(parentPath: string, name: string, type: "file" | "folder") {
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    try {
      if (type === "folder") {
        await getFS().mkdir(fullPath);
      } else {
        await getFS().writeFile(fullPath, "");
      }
      setCreatingIn(null);
      setFsVersion((v) => v + 1);
      if (type === "file") props.onOpenFile(fullPath);
    } catch (err: any) {
      notify({ type: "error", message: `Create failed: ${err.message || err}` });
      setCreatingIn(null);
    }
  }

  async function handleDragMove(sourcePath: string, targetDir: string) {
    if (!sourcePath || !targetDir) return;
    const fileName = sourcePath.split("/").pop() ?? "";
    const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;
    if (sourcePath === newPath) return;
    try {
      await getFS().rename(sourcePath, newPath);
      setFsVersion((v) => v + 1);
      notify({ type: "info", message: `Moved "${fileName}" to ${targetDir || "/"}` });
    } catch (err: any) {
      notify({ type: "error", message: `Move failed: ${err.message || err}` });
    }
    setTreeDragOver(null);
  }

  async function handleDelete(path: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await getFS().delete(path, true);
      setFsVersion((v) => v + 1);
    } catch (err: any) {
      notify({ type: "error", message: `Delete failed: ${err.message || err}` });
    }
  }

  const handleTreeContextMenu = (e: MouseEvent, node: FileNode) => {
    const items: ContextMenuItem[] = node.type === "file"
      ? [
          { id: "open", label: "Open File", action: () => props.onOpenFile(node.path) },
          { id: "copy-path", label: "Copy Path", shortcut: "Ctrl+Shift+C", action: () => navigator.clipboard.writeText(node.path) },
          { id: "copy-name", label: "Copy Name", action: () => navigator.clipboard.writeText(node.name) },
          { id: "div1", label: "", divider: true, action: () => {} },
          { id: "rename", label: "Rename", shortcut: "F2", action: () => setEditingPath(node.path) },
          { id: "delete", label: "Delete", action: () => handleDelete(node.path, node.name) },
        ]
      : [
          { id: "new-file", label: "New File...", action: () => setCreatingIn({ path: node.path, type: "file" }) },
          { id: "new-folder", label: "New Folder...", action: () => setCreatingIn({ path: node.path, type: "folder" }) },
          { id: "div1", label: "", divider: true, action: () => {} },
          { id: "copy-path", label: "Copy Path", shortcut: "Ctrl+Shift+C", action: () => navigator.clipboard.writeText(node.path) },
          { id: "rename", label: "Rename", shortcut: "F2", action: () => setEditingPath(node.path) },
          { id: "delete", label: "Delete", action: () => handleDelete(node.path, node.name) },
        ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };
  let searchInputRef: HTMLInputElement | undefined;

  /** Check if a file path matches an exclusion glob pattern (simple glob: *, **, comma-separated). */
  const matchesGlob = (filePath: string, pattern: string): boolean => {
    if (!pattern.trim()) return false;
    const patterns = pattern.split(",").map((p) => p.trim()).filter(Boolean);
    for (const pat of patterns) {
      const regex = new RegExp(
        "^" + pat.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$",
        "i"
      );
      if (regex.test(filePath) || regex.test(filePath.split("/").pop() ?? "")) return true;
    }
    return false;
  };
  const matchesExclusion = (filePath: string, pattern: string): boolean => matchesGlob(filePath, pattern);
  const matchesInclusion = (filePath: string, pattern: string): boolean => {
    if (!pattern.trim()) return true; // Empty include = include all
    return matchesGlob(filePath, pattern);
  };

  // Reactive search results (async via filesystem)
  const [searchResults] = createResource(
    () => ({ query: searchQuery().trim(), cs: caseSensitive(), regex: useRegex(), ww: wholeWord(), exclude: excludePattern().trim(), include: includePattern().trim() }),
    async ({ query, cs, regex, ww, exclude, include }) => {
      if (query.length < 2) return new Map<string, SearchMatch[]>();
      if (regex) {
        // Validate regex
        try { new RegExp(query, cs ? "g" : "gi"); } catch { return new Map<string, SearchMatch[]>(); }
      }
      const raw = await getFS().searchFiles(regex ? "" : query, { caseSensitive: cs });
      // If not using regex and no exclusion/inclusion, return as-is (apply include filter)
      if (!regex && !exclude && !include) return raw;
      // Apply include/exclude filters to raw results
      if (!regex && (exclude || include)) {
        const filtered = new Map<string, SearchMatch[]>();
        for (const [file, matches] of raw) {
          if (exclude && matchesExclusion(file, exclude)) continue;
          if (include && !matchesInclusion(file, include)) continue;
          filtered.set(file, matches);
        }
        return filtered;
      }
      // If regex, we need to re-search with regex matching
      if (regex) {
        const results = new Map<string, SearchMatch[]>();
        const re = new RegExp(query, cs ? "g" : "gi");
        // Read all files from the tree and search with regex
        const tree = await getFS().readDir("", 6);
        const flatFiles: string[] = [];
        const flatten = (nodes: FileNode[]) => {
          for (const n of nodes) {
            if (n.type === "file") flatFiles.push(n.path);
            else if (n.children) flatten(n.children);
          }
        };
        flatten(tree);
        let totalCount = 0;
        for (const file of flatFiles) {
          if (totalCount >= 5000) break;
          if (exclude && matchesExclusion(file, exclude)) continue;
          if (include && !matchesInclusion(file, include)) continue;
          try {
            const content = await getFS().readFile(file);
            const lines = content.split("\n");
            const matches: SearchMatch[] = [];
            for (let i = 0; i < lines.length; i++) {
              re.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = re.exec(lines[i])) !== null) {
                matches.push({ file, line: i + 1, text: lines[i], matchStart: m.index, matchEnd: m.index + m[0].length });
                totalCount++;
                if (totalCount >= 5000) break;
                if (!re.global) break;
              }
              if (totalCount >= 5000) break;
            }
            if (matches.length > 0) results.set(file, matches);
          } catch { /* skip unreadable files */ }
        }
        return results;
      }
      // Plain text with exclusion filter
      const filtered = new Map<string, SearchMatch[]>();
      for (const [file, matches] of raw.entries()) {
        if (!matchesExclusion(file, exclude)) {
          filtered.set(file, matches);
        }
      }
      return filtered;
    }
  );

  // Total match count
  const totalMatches = createMemo(() => {
    const results = searchResults();
    if (!results) return 0;
    let count = 0;
    for (const matches of results.values()) {
      count += matches.length;
    }
    return count;
  });

  // File count
  const fileCount = createMemo(() => searchResults()?.size ?? 0);

  // Toggle file expansion in search results
  const toggleFileExpansion = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  // Auto-expand all files when search changes
  const isFileExpanded = (file: string) => {
    // Auto-expand by default (if not explicitly collapsed)
    return !expandedFiles().has(file);
  };

  /** Build a regex or literal matcher from the current search query */
  function buildSearchPattern(): RegExp | null {
    const query = searchQuery().trim();
    if (query.length < 2) return null;
    const flags = caseSensitive() ? "g" : "gi";
    if (useRegex()) {
      try { return new RegExp(query, flags); } catch { return null; }
    }
    let escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (wholeWord()) {
      escaped = `\\b${escaped}\\b`;
    }
    return new RegExp(escaped, flags);
  }

  /** Replace all occurrences in a single file */
  async function replaceInFile(filePath: string) {
    const pattern = buildSearchPattern();
    if (!pattern || !replaceQuery() && replaceQuery() !== "") return;
    const fs = getFS();
    try {
      const content = await fs.readFile(filePath);
      const newContent = content.replace(pattern, replaceQuery());
      if (content !== newContent) {
        await fs.writeFile(filePath, newContent);
        // Notify editor to reload
        document.dispatchEvent(new CustomEvent("codex:file-changed-external", { detail: { path: filePath } }));
      }
    } catch {}
  }

  /** Replace all occurrences across all matching files */
  async function replaceAll() {
    const results = searchResults();
    if (!results || results.size === 0) return;
    setReplacing(true);
    try {
      const files = [...results.keys()];
      for (const file of files) {
        await replaceInFile(file);
      }
      // Re-trigger search to update results
      setSearchQuery(searchQuery() + " ");
      setSearchQuery(searchQuery().trim());
      notify(`Replaced in ${files.length} file${files.length !== 1 ? "s" : ""}`, "success", 3000);
    } catch (err: any) {
      notify(`Replace failed: ${err.message || err}`, "error", 5000);
    } finally {
      setReplacing(false);
    }
  }

  // File icon color based on extension
  const fileIconColor = (name: string) => {
    const ext = name.split(".").pop() ?? "";
    switch (ext) {
      case "ts": case "tsx": return "var(--accent-blue)";
      case "js": case "jsx": return "var(--accent-orange)";
      case "json": return "var(--accent-green)";
      case "md": return "var(--text-tertiary)";
      case "css": return "var(--accent-purple)";
      default: return "var(--text-disabled)";
    }
  };

  // --- Git Panel State ---
  const [gitBranch, setGitBranch] = createSignal("");
  const [gitChanges, setGitChanges] = createSignal<{ path: string; status: string }[]>([]);
  const [gitStaged, setGitStaged] = createSignal<{ path: string; status: string }[]>([]);
  const [gitLoading, setGitLoading] = createSignal(false);
  const [commitMsg, setCommitMsg] = createSignal("");
  const [committing, setCommitting] = createSignal(false);
  const [gitError, setGitError] = createSignal("");
  const [gitBranches, setGitBranches] = createSignal<string[]>([]);
  const [branchSwitcherOpen, setBranchSwitcherOpen] = createSignal(false);
  const [newBranchName, setNewBranchName] = createSignal("");

  const hasTerraRuntime = () => !!(window as any).__TAURI__?.core?.invoke;

  async function runGit(command: string): Promise<string> {
    const tr = (window as any).__TAURI__;
    if (!tr?.core?.invoke) throw new Error("TerraRuntime not available");
    return (await tr.core.invoke("run_command", { command })) as string;
  }

  function parseGitStatus(output: string) {
    const lines = output.split("\n").filter((l) => l.length > 0);
    let branch = "";
    const changes: { path: string; status: string }[] = [];
    const staged: { path: string; status: string }[] = [];
    for (const line of lines) {
      if (line.startsWith("## ")) {
        branch = line.slice(3).split("...")[0].split(" ")[0];
        continue;
      }
      if (line.length < 4) continue;
      const ix = line[0];
      const wt = line[1];
      const fp = line.slice(3).split(" -> ").pop() ?? line.slice(3);
      if (ix !== " " && ix !== "?") staged.push({ path: fp, status: ix });
      if (wt !== " " || ix === "?") changes.push({ path: fp, status: ix === "?" ? "U" : wt });
    }
    return { branch, changes, staged };
  }

  async function refreshGitStatus() {
    if (!hasTerraRuntime()) return;
    setGitLoading(true);
    setGitError("");
    try {
      const output = await runGit("git status --porcelain -b");
      const { branch, changes, staged } = parseGitStatus(output);
      setGitBranch(branch);
      setGitChanges(changes);
      setGitStaged(staged);
      // Update shared git status store for EditorArea tab coloring
      updateGitChanges(changes, staged);
      // Broadcast branch name so StatusBar can display it dynamically
      document.dispatchEvent(new CustomEvent("codex:git-branch", { detail: { branch } }));
    } catch (err: any) {
      const msg = err.message || String(err);
      setGitError(msg.includes("not a git repository") ? "Not a git repository" : msg);
    } finally {
      setGitLoading(false);
    }
  }

  async function fetchBranches() {
    if (!hasTerraRuntime()) return;
    try {
      const output = await runGit("git branch --list --no-color");
      const branches = output.split("\n")
        .map((l) => l.replace(/^\*?\s+/, "").trim())
        .filter((l) => l.length > 0);
      setGitBranches(branches);
    } catch {}
  }

  async function switchBranch(branch: string) {
    if (!hasTerraRuntime()) return;
    try {
      await runGit(`git checkout "${branch}"`);
      setBranchSwitcherOpen(false);
      await refreshGitStatus();
      notify(`Switched to branch: ${branch}`, "success", 2000);
    } catch (err: any) {
      notify(`Failed to switch branch: ${err.message || err}`, "error", 4000);
    }
  }

  async function createBranch() {
    const name = newBranchName().trim();
    if (!name || !hasTerraRuntime()) return;
    try {
      await runGit(`git checkout -b "${name}"`);
      setNewBranchName("");
      setBranchSwitcherOpen(false);
      await refreshGitStatus();
      notify(`Created branch: ${name}`, "success", 2000);
    } catch (err: any) {
      notify(`Failed to create branch: ${err.message || err}`, "error", 4000);
    }
  }

  async function gitStageFile(path: string) {
    try { await runGit(`git add -- "${path}"`); await refreshGitStatus(); } catch {}
  }
  async function gitUnstageFile(path: string) {
    try { await runGit(`git restore --staged -- "${path}"`); await refreshGitStatus(); } catch {}
  }
  async function gitStageAll() {
    try { await runGit("git add -A"); await refreshGitStatus(); } catch {}
  }
  async function gitUnstageAll() {
    try { await runGit("git restore --staged ."); await refreshGitStatus(); } catch {}
  }
  async function gitDoCommit() {
    const msg = commitMsg().trim();
    if (!msg || gitStaged().length === 0) return;
    setCommitting(true);
    try {
      const escaped = msg.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      await runGit(`git commit -m "${escaped}"`);
      setCommitMsg("");
      await refreshGitStatus();
    } catch (err: any) {
      setGitError(err.message || String(err));
    } finally {
      setCommitting(false);
    }
  }

  // --- Git Log ---
  const [gitLog, setGitLog] = createSignal<{ hash: string; shortHash: string; message: string; author: string; date: string }[]>([]);
  const [gitLogExpanded, setGitLogExpanded] = createSignal(false);

  async function refreshGitLog() {
    if (!hasTerraRuntime()) return;
    try {
      const output = await runGit('git log --oneline --format="%H|%h|%s|%an|%cr" -20');
      const entries = output.split("\n").filter((l) => l.trim().length > 0).map((line) => {
        const parts = line.split("|");
        return {
          hash: parts[0] ?? "",
          shortHash: parts[1] ?? "",
          message: parts[2] ?? "",
          author: parts[3] ?? "",
          date: parts[4] ?? "",
        };
      });
      setGitLog(entries);
    } catch {
      setGitLog([]);
    }
  }

  let gitRefreshTimer: ReturnType<typeof setInterval> | undefined;
  createEffect(() => {
    if (props.activePanel === "git") {
      refreshGitStatus();
      refreshGitLog();
      gitRefreshTimer = setInterval(refreshGitStatus, 5000);
    } else {
      if (gitRefreshTimer) { clearInterval(gitRefreshTimer); gitRefreshTimer = undefined; }
    }
  });
  onCleanup(() => { if (gitRefreshTimer) clearInterval(gitRefreshTimer); });

  const gitStatusColor = (s: string) => {
    switch (s) {
      case "M": return "var(--accent-orange)";
      case "A": return "var(--accent-green)";
      case "D": return "var(--accent-red)";
      case "R": case "C": return "var(--accent-blue)";
      case "U": return "var(--text-disabled)";
      default: return "var(--text-tertiary)";
    }
  };

  /** Show inline diff for a git file. For unstaged: HEAD vs working tree. For staged: HEAD vs index. */
  async function showGitDiff(filePath: string, staged: boolean) {
    try {
      let oldContent = "";
      let newContent = "";

      if (staged) {
        // Staged: compare HEAD version vs index (staged) version
        try { oldContent = await runGit(`git show HEAD:"${filePath}"`); } catch { oldContent = ""; }
        try { newContent = await runGit(`git show :"${filePath}"`); } catch { newContent = ""; }
      } else {
        // Unstaged: compare index (or HEAD if no index) vs working tree
        try { oldContent = await runGit(`git show :"${filePath}"`); } catch {
          try { oldContent = await runGit(`git show HEAD:"${filePath}"`); } catch { oldContent = ""; }
        }
        // Read working tree file content
        const fs = getFS();
        try { newContent = await fs.readFile(filePath); } catch {
          try { newContent = await runGit(`git diff "${filePath}" | cat`); newContent = ""; } catch { newContent = ""; }
        }
      }

      // For deleted files, swap if needed
      if (!newContent && oldContent) {
        // File deleted — show removal
      }

      document.dispatchEvent(new CustomEvent("codex:show-diff", {
        detail: {
          fileName: filePath,
          oldContent,
          newContent,
        },
      }));
    } catch (err: any) {
      // Fallback: just open the file normally
      props.onOpenFile(filePath);
    }
  }

  const gitFileName = (p: string) => p.split("/").pop() ?? p;
  const gitFileDir = (p: string) => {
    const parts = p.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  };

  /** Render a single outline node with optional children (recursive). */
  function renderOutlineNode(sym: OutlineSymbol, depth: number): any {
    const si = SYMBOL_ICONS[sym.kind];
    const hasChildren = sym.children && sym.children.length > 0;
    const nodeKey = `${sym.name}:${sym.line}`;
    const isExpanded = expandedOutlineNodes().has(nodeKey);

    const toggleExpand = (e: MouseEvent) => {
      e.stopPropagation();
      setExpandedOutlineNodes(prev => {
        const next = new Set(prev);
        if (next.has(nodeKey)) next.delete(nodeKey); else next.add(nodeKey);
        return next;
      });
    };

    return (
      <>
        <div
          class={`outline-item ${hasChildren ? "outline-parent" : ""}`}
          style={{ "padding-left": `${12 + depth * 16}px` }}
          onClick={() => {
            document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line: sym.line } }));
          }}
          title={`${sym.kind}: ${sym.name}${sym.detail ? ` — ${sym.detail}` : ""} (line ${sym.line})`}
        >
          <Show when={hasChildren} fallback={<span class="outline-indent" />}>
            <span
              class="outline-expand"
              style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
              onClick={toggleExpand}
            >&#9654;</span>
          </Show>
          <span class="outline-sym-icon" style={{ color: si.color }}>{si.icon}</span>
          <span class="outline-sym-name">{sym.name}</span>
          <Show when={sym.detail}>
            <span class="outline-sym-detail">{sym.detail}</span>
          </Show>
          <span class="outline-sym-line">:{sym.line}</span>
        </div>
        <Show when={hasChildren && isExpanded}>
          <For each={sym.children!}>
            {(child) => renderOutlineNode(child, depth + 1)}
          </For>
        </Show>
      </>
    );
  }

  return (
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">
          {props.activePanel === "files" && (workspaceRootName() ? workspaceRootName()!.toUpperCase() : "EXPLORER")}
          {props.activePanel === "search" && "SEARCH"}
          {props.activePanel === "git" && "SOURCE CONTROL"}
          {props.activePanel === "tests" && "TEST EXPLORER"}
          {props.activePanel === "extensions" && "EXTENSIONS"}
        </span>
        <Show when={props.activePanel === "files"}>
          <button
            class={`sidebar-header-btn ${treeFilterVisible() ? "active" : ""}`}
            title="Filter files"
            onClick={() => { setTreeFilterVisible((v) => !v); if (treeFilterVisible()) { setTreeFilterQuery(""); } }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 10.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zm-2-3a.5.5 0 01.5-.5h7a.5.5 0 010 1h-7a.5.5 0 01-.5-.5zm-2-3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5z"/></svg>
          </button>
        </Show>
      </div>

      <div class="sidebar-content">
        <Show when={props.activePanel === "files"}>
          <Show when={getCurrentBackend() === "demo" && isFSAccessAvailable()}>
            <button
              class="open-folder-btn"
              onClick={async () => {
                const dir = await upgradeToBrowserFS();
                if (dir) setFsVersion((v) => v + 1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1A1.5 1.5 0 000 2.5v11A1.5 1.5 0 001.5 15h13a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0014.5 3H7.707l-1.5-1.5A1.5 1.5 0 005.086 1H1.5z"/></svg>
              Open Folder
            </button>
          </Show>

          {/* Explorer filter input */}
          <Show when={treeFilterVisible()}>
            <div class="tree-filter-row">
              <input
                class="tree-filter-input"
                type="text"
                placeholder="Filter files by name..."
                value={treeFilterQuery()}
                onInput={(e) => setTreeFilterQuery(e.currentTarget.value)}
                autofocus
              />
              <Show when={treeFilterQuery()}>
                <button class="tree-filter-clear" onClick={() => setTreeFilterQuery("")}>&times;</button>
              </Show>
            </div>
          </Show>

          {/* Open Editors section */}
          <Show when={(props.openFiles ?? []).length > 0}>
            <div class="open-editors-section">
              <div class="open-editors-header" onClick={() => setOpenEditorsExpanded((v) => !v)}>
                <span class="tree-arrow" style={{ transform: openEditorsExpanded() ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                <span class="open-editors-title">OPEN EDITORS</span>
                <span class="open-editors-badge">{(props.openFiles ?? []).length}</span>
              </div>
              <Show when={openEditorsExpanded()}>
                <div class="open-editors-list">
                  <For each={props.openFiles ?? []}>
                    {(file) => {
                      const name = file.split("/").pop() ?? file;
                      const icon = getFileIcon(file);
                      return (
                        <div
                          class={`open-editors-item ${props.activeFile === file ? "active" : ""}`}
                          onClick={() => props.onOpenFile(file)}
                        >
                          <button
                            class="open-editors-close"
                            onClick={(e) => { e.stopPropagation(); props.onCloseFile?.(file); }}
                            title="Close"
                          >&times;</button>
                          <span class="open-editors-icon" style={{ color: icon.color }}>{icon.label ?? "\u25CB"}</span>
                          <span class="open-editors-name">{name}</span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={fileTree.loading}>
            <LoadingSpinner size="sm" label="Loading files..." />
          </Show>
          <div class={`file-tree-container${treeMounted() ? " mounted" : ""}`}>
            <Show when={workspaceRootName()} fallback={
              <For each={filteredFileTree()}>
                {(node) => <FileTreeNode node={node} depth={0} onOpenFile={props.onOpenFile} onContextMenu={handleTreeContextMenu} editingPath={editingPath()} onEditDone={handleRename} onEditCancel={() => setEditingPath(null)} creatingIn={creatingIn()} onCreateDone={handleCreate} onCreateCancel={() => setCreatingIn(null)} dragOverPath={treeDragOver()} onDragMove={handleDragMove} onDragOverChange={setTreeDragOver} gitChanges={gitChanges()} gitStaged={gitStaged()} />}
              </For>
            }>
              <div class="tree-root-node" onClick={() => setRootExpanded((v) => !v)}>
                <span class="tree-arrow" style={{ transform: rootExpanded() ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                <span class="tree-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-tertiary)"><path d={rootExpanded() ? "M1.5 3A1.5 1.5 0 000 4.5v8A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V6.5A1.5 1.5 0 0014.5 5H7.707l-1.5-1.5A1.5 1.5 0 005.086 3H1.5z" : "M1.5 1A1.5 1.5 0 000 2.5v11A1.5 1.5 0 001.5 15h13a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0014.5 3H7.707l-1.5-1.5A1.5 1.5 0 005.086 1H1.5z"}/></svg></span>
                <span class="tree-root-name">{workspaceRootName()}</span>
              </div>
              <Show when={rootExpanded()}>
                <For each={filteredFileTree()}>
                  {(node) => <FileTreeNode node={node} depth={1} onOpenFile={props.onOpenFile} onContextMenu={handleTreeContextMenu} editingPath={editingPath()} onEditDone={handleRename} onEditCancel={() => setEditingPath(null)} creatingIn={creatingIn()} onCreateDone={handleCreate} onCreateCancel={() => setCreatingIn(null)} dragOverPath={treeDragOver()} onDragMove={handleDragMove} onDragOverChange={setTreeDragOver} gitChanges={gitChanges()} gitStaged={gitStaged()} />}
                </For>
              </Show>
            </Show>
          </div>

          {/* Outline / Symbols section — LSP hierarchical with regex fallback */}
          <Show when={props.activeFile && (displayOutline().length > 0 || outlineFilter())}>
            <div class="outline-section">
              <div class="outline-header" onClick={() => setOutlineExpanded((v) => !v)}>
                <span class="outline-arrow" style={{ transform: outlineExpanded() ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                <span class="outline-title">OUTLINE</span>
                <span class="outline-badge">{countSymbols(displayOutline())}</span>
                <Show when={lspSymbols()}>
                  <span class="outline-lsp-badge">LSP</span>
                </Show>
              </div>
              <Show when={outlineExpanded()}>
                <div class="outline-toolbar">
                  <input
                    class="outline-filter"
                    type="text"
                    placeholder="Filter symbols..."
                    value={outlineFilter()}
                    onInput={(e) => setOutlineFilter(e.currentTarget.value)}
                  />
                  <select
                    class="outline-sort"
                    value={outlineSortMode()}
                    onChange={(e) => setOutlineSortMode(e.currentTarget.value as OutlineSortMode)}
                    title="Sort symbols"
                  >
                    <option value="position">Position</option>
                    <option value="name">Name</option>
                    <option value="kind">Kind</option>
                  </select>
                </div>
                <div class="outline-list">
                  <For each={displayOutline()}>
                    {(sym) => renderOutlineNode(sym, 0)}
                  </For>
                  <Show when={displayOutline().length === 0 && outlineFilter()}>
                    <div class="outline-empty">No matching symbols</div>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>

          {/* Timeline section — local file history */}
          <div class="timeline-section">
            <div class="timeline-header" onClick={() => setTimelineExpanded((v) => !v)}>
              <span class="outline-arrow" style={{ transform: timelineExpanded() ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
              <span class="outline-title">TIMELINE</span>
              <span class="outline-badge">{timelineEntries().length}</span>
            </div>
            <Show when={timelineExpanded()}>
              <div class="timeline-list">
                <Show when={timelineEntries().length === 0}>
                  <div class="outline-empty">No timeline entries yet</div>
                </Show>
                <For each={timelineEntries()}>
                  {(entry) => (
                    <div class="timeline-entry">
                      <span class={`timeline-icon timeline-${entry.type}`}>
                        {entry.type === "save" ? "\u{1F4BE}" : entry.type === "create" ? "\u2728" : "\u270F"}
                      </span>
                      <span class="timeline-label">{entry.label}</span>
                      <span class="timeline-time">{entry.time}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={props.activePanel === "search"}>
          <div class="search-panel">
            <div class="search-input-row">
              <button
                class={`search-replace-toggle ${replaceExpanded() ? "expanded" : ""}`}
                onClick={() => setReplaceExpanded((v) => !v)}
                title={replaceExpanded() ? "Hide Replace" : "Show Replace"}
              >
                &#9654;
              </button>
              <input
                ref={searchInputRef}
                class="search-input"
                type="text"
                placeholder="Search in files..."
                value={searchQuery()}
                onInput={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  setExpandedFiles(new Set<string>());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                  }
                }}
              />
              <button
                class={`search-option-btn ${caseSensitive() ? "active" : ""}`}
                onClick={() => setCaseSensitive((v) => !v)}
                title="Match Case"
              >
                Aa
              </button>
              <button
                class={`search-option-btn ${wholeWord() ? "active" : ""}`}
                onClick={() => setWholeWord((v) => !v)}
                title="Match Whole Word"
              >
                Ab
              </button>
              <button
                class={`search-option-btn ${useRegex() ? "active" : ""}`}
                onClick={() => setUseRegex((v) => !v)}
                title="Use Regular Expression"
              >
                .*
              </button>
              <button
                class={`search-option-btn ${showExclude() ? "active" : ""}`}
                onClick={() => setShowExclude((v) => !v)}
                title="Toggle Exclude Filter"
              >
                {"\u2026"}
              </button>
            </div>
            <Show when={replaceExpanded()}>
              <div class="search-replace-row">
                <input
                  class="search-input"
                  type="text"
                  placeholder="Replace..."
                  value={replaceQuery()}
                  onInput={(e) => setReplaceQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) replaceAll();
                  }}
                />
                <button
                  class="search-replace-btn"
                  onClick={replaceAll}
                  disabled={replacing() || totalMatches() === 0}
                  title="Replace All (Ctrl+Enter)"
                >
                  {replacing() ? "..." : "All"}
                </button>
              </div>
            </Show>
            <Show when={showExclude()}>
              <div class="search-exclude-row">
                <input
                  class="search-input search-exclude-input"
                  type="text"
                  placeholder="files to include (e.g. src, *.tsx)"
                  value={includePattern()}
                  onInput={(e) => setIncludePattern(e.currentTarget.value)}
                />
              </div>
              <div class="search-exclude-row">
                <input
                  class="search-input search-exclude-input"
                  type="text"
                  placeholder="files to exclude (e.g. node_modules, *.min.js)"
                  value={excludePattern()}
                  onInput={(e) => setExcludePattern(e.currentTarget.value)}
                />
              </div>
            </Show>

            <Show when={searchQuery().trim().length >= 2}>
              <div class="search-summary">
                <Show when={totalMatches() > 0} fallback={
                  <span class="search-no-results">No results found</span>
                }>
                  <span class="search-count">
                    {totalMatches()} result{totalMatches() !== 1 ? "s" : ""} in {fileCount()} file{fileCount() !== 1 ? "s" : ""}
                  </span>
                </Show>
              </div>
            </Show>

            <div class="search-results">
              <For each={[...(searchResults() ?? new Map()).entries()]}>
                {([file, matches]) => {
                  const fileName = file.split("/").pop() ?? file;
                  return (
                    <div class="search-file-group">
                      <div
                        class="search-file-header"
                        onClick={() => toggleFileExpansion(file)}
                      >
                        <span class="search-file-arrow" style={{
                          transform: isFileExpanded(file) ? "rotate(90deg)" : "rotate(0deg)"
                        }}>&#9654;</span>
                        <span class="search-file-icon" style={{ color: fileIconColor(fileName) }}>*</span>
                        <span class="search-file-name truncate">{fileName}</span>
                        <span class="search-file-path truncate">{file}</span>
                        <span class="search-match-badge">{matches.length}</span>
                        <Show when={replaceExpanded()}>
                          <button
                            class="search-file-replace-btn"
                            onClick={(e) => { e.stopPropagation(); replaceInFile(file); }}
                            title={`Replace in ${fileName}`}
                          >
                            &#8634;
                          </button>
                        </Show>
                      </div>
                      <Show when={isFileExpanded(file)}>
                        <div class="search-file-matches">
                          <For each={matches}>
                            {(match) => (
                              <div
                                class="search-result-line"
                                onClick={() => {
                                  props.onOpenFile(file);
                                  setTimeout(() => document.dispatchEvent(new CustomEvent("codex:goto-line", { detail: { line: match.line } })), 100);
                                }}
                              >
                                <span class="search-line-num">{match.line}</span>
                                <HighlightedMatch match={match} query={searchQuery()} />
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        <Show when={props.activePanel === "git"}>
          <div class="git-panel">
            {/* Branch bar + refresh */}
            <div class="git-branch-bar">
              <div class="git-branch" onClick={() => { fetchBranches(); setBranchSwitcherOpen((v) => !v); }} style={{ cursor: "pointer" }} title="Switch Branch">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 113 2.122V6.5A3.5 3.5 0 019 10H5.5v1.128a2.251 2.251 0 11-1.5 0V4.872a2.251 2.251 0 111.5 0v4.125a2 2 0 002 2H9a2 2 0 002-2V5.372a2.25 2.25 0 01-1.5-2.122z"/></svg>
                <span class="git-branch-name">{gitBranch() || "\u2014"}</span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}><path d="M4.5 6l3.5 4 3.5-4z"/></svg>
              </div>
              <button class="git-icon-btn" onClick={refreshGitStatus} title="Refresh" disabled={gitLoading()}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: gitLoading() ? 0.3 : 1 }}><path d="M13.987 7.164A6 6 0 002.68 4.656L1.5 3.5v4h4L4.1 6.1a4.5 4.5 0 018.48 1.064l1.407-.001zM2.013 8.836A6 6 0 0013.32 11.344l1.18 1.156v-4h-4l1.4 1.4a4.5 4.5 0 01-8.48-1.064H2.014z"/></svg>
              </button>
            </div>

            {/* Branch Switcher Dropdown */}
            <Show when={branchSwitcherOpen()}>
              <div class="branch-switcher">
                <div class="branch-switcher-create">
                  <input
                    class="branch-input"
                    type="text"
                    placeholder="Create new branch..."
                    value={newBranchName()}
                    onInput={(e) => setNewBranchName(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createBranch(); }}
                  />
                  <button class="git-icon-btn" onClick={createBranch} title="Create Branch" disabled={!newBranchName().trim()}>+</button>
                </div>
                <div class="branch-list">
                  <For each={gitBranches()}>
                    {(branch) => (
                      <button
                        class={`branch-item ${branch === gitBranch() ? "active" : ""}`}
                        onClick={() => switchBranch(branch)}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: branch === gitBranch() ? 1 : 0.3 }}><path d="M9.5 3.25a2.25 2.25 0 113 2.122V6.5A3.5 3.5 0 019 10H5.5v1.128a2.251 2.251 0 11-1.5 0V4.872a2.251 2.251 0 111.5 0v4.125a2 2 0 002 2H9a2 2 0 002-2V5.372a2.25 2.25 0 01-1.5-2.122z"/></svg>
                        <span>{branch}</span>
                        {branch === gitBranch() && <span class="branch-current-badge">current</span>}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={gitLoading()}>
              <LoadingSpinner size="sm" label="Refreshing..." />
            </Show>

            <Show when={gitError()}>
              <div class="git-error">{gitError()}</div>
            </Show>

            <Show when={!hasTerraRuntime()}>
              <div class="git-note">Git integration requires the desktop app</div>
            </Show>

            <Show when={hasTerraRuntime()}>
              {/* Commit area */}
              <div class="git-commit-area">
                <input
                  class="git-commit-input"
                  type="text"
                  placeholder="Commit message..."
                  value={commitMsg()}
                  onInput={(e) => setCommitMsg(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) gitDoCommit(); }}
                  disabled={committing()}
                />
                <button
                  class="git-commit-btn"
                  onClick={gitDoCommit}
                  disabled={committing() || !commitMsg().trim() || gitStaged().length === 0}
                >
                  {committing() ? "Committing..." : "Commit"}
                </button>
              </div>

              {/* Staged Changes */}
              <div class="git-section">
                <div class="git-section-header">
                  <span class="git-section-title">Staged Changes</span>
                  <div class="git-section-actions">
                    <Show when={gitStaged().length > 0}>
                      <button class="git-icon-btn" onClick={gitUnstageAll} title="Unstage All">&minus;</button>
                    </Show>
                    <span class="git-badge">{gitStaged().length}</span>
                  </div>
                </div>
                <Show when={gitStaged().length === 0}>
                  <div class="git-empty">No staged changes</div>
                </Show>
                <For each={gitStaged()}>
                  {(file) => (
                    <div class="git-file-item" onClick={() => showGitDiff(file.path, true)}>
                      <span class="git-file-status" style={{ color: gitStatusColor(file.status) }}>{file.status}</span>
                      <span class="git-file-name truncate">{gitFileName(file.path)}</span>
                      <span class="git-file-dir truncate">{gitFileDir(file.path)}</span>
                      <button class="git-icon-btn git-file-action" onClick={(e) => { e.stopPropagation(); gitUnstageFile(file.path); }} title="Unstage">&minus;</button>
                    </div>
                  )}
                </For>
              </div>

              {/* Unstaged Changes */}
              <div class="git-section">
                <div class="git-section-header">
                  <span class="git-section-title">Changes</span>
                  <div class="git-section-actions">
                    <Show when={gitChanges().length > 0}>
                      <button class="git-icon-btn" onClick={gitStageAll} title="Stage All">+</button>
                    </Show>
                    <span class="git-badge">{gitChanges().length}</span>
                  </div>
                </div>
                <Show when={gitChanges().length === 0}>
                  <div class="git-empty">Working tree clean</div>
                </Show>
                <For each={gitChanges()}>
                  {(file) => (
                    <div class="git-file-item" onClick={() => showGitDiff(file.path, false)}>
                      <span class="git-file-status" style={{ color: gitStatusColor(file.status) }}>{file.status}</span>
                      <span class="git-file-name truncate">{gitFileName(file.path)}</span>
                      <span class="git-file-dir truncate">{gitFileDir(file.path)}</span>
                      <button class="git-icon-btn git-file-action" onClick={(e) => { e.stopPropagation(); gitStageFile(file.path); }} title="Stage">+</button>
                    </div>
                  )}
                </For>
              </div>

              {/* Commit History (Git Log) */}
              <div class="git-section">
                <div class="git-section-header" onClick={() => setGitLogExpanded((v) => !v)} style={{ cursor: "pointer" }}>
                  <span class="git-section-arrow" style={{ transform: gitLogExpanded() ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block", "font-size": "8px", "margin-right": "4px" }}>&#9654;</span>
                  <span class="git-section-title">Commit History</span>
                  <span class="git-badge">{gitLog().length}</span>
                </div>
                <Show when={gitLogExpanded()}>
                  <Show when={gitLog().length === 0}>
                    <div class="git-empty">No commits</div>
                  </Show>
                  <For each={gitLog()}>
                    {(entry) => (
                      <div class="git-log-item" title={`${entry.hash}\n${entry.author}\n${entry.date}`}>
                        <span class="git-log-hash">{entry.shortHash}</span>
                        <span class="git-log-message truncate">{entry.message}</span>
                        <span class="git-log-date">{entry.date}</span>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={props.activePanel === "tests"}>
          {(() => {
            const [testFilter, setTestFilter] = createSignal("");
            const [expandedFiles, setExpandedFiles] = createSignal<Set<string>>(new Set());

            const hasTR = () => !!(window as any).__TAURI__?.core?.invoke;

            const filteredFiles = createMemo(() => {
              const q = testFilter().toLowerCase();
              if (!q) return testFiles();
              return testFiles().filter(f =>
                f.name.toLowerCase().includes(q) ||
                f.tests.some(t => t.name.toLowerCase().includes(q))
              );
            });

            const toggleExpand = (path: string) => {
              setExpandedFiles(prev => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              });
            };

            return (
              <div class="test-explorer">
                <div class="test-toolbar">
                  <select
                    class="test-runner-select"
                    value={selectedRunner()}
                    onChange={(e) => setRunner(e.currentTarget.value as TestRunner)}
                    disabled={isRunning()}
                  >
                    <option value="vitest">Vitest</option>
                    <option value="jest">Jest</option>
                    <option value="mocha">Mocha</option>
                  </select>
                  <button
                    class="test-action-btn test-discover-btn"
                    onClick={() => discoverTests()}
                    disabled={isRunning()}
                    title="Discover Tests"
                  >Scan</button>
                  <button
                    class="test-action-btn test-run-all-btn"
                    onClick={() => runAllTests()}
                    disabled={isRunning() || testFiles().length === 0}
                    title="Run All Tests"
                  >{isRunning() ? "\u25D0" : "\u25B6"}</button>
                </div>

                <Show when={lastSummary()}>
                  {(summary) => (
                    <div class="test-summary-bar">
                      <span class="test-sum-passed">{"\u2713"} {summary().passed}</span>
                      <span class="test-sum-failed">{"\u2715"} {summary().failed}</span>
                      <span class="test-sum-skipped">{"\u2298"} {summary().skipped}</span>
                      <span class="test-sum-total">{summary().total} total</span>
                    </div>
                  )}
                </Show>

                <Show when={testError()}>
                  <div class="test-error">{testError()}</div>
                </Show>

                <input
                  class="test-filter"
                  type="text"
                  placeholder="Filter tests..."
                  value={testFilter()}
                  onInput={(e) => setTestFilter(e.currentTarget.value)}
                />

                <div class="test-list">
                  <Show when={!hasTR()}>
                    <div class="test-note">Test execution requires the desktop app</div>
                  </Show>
                  <Show when={isRunning()}>
                    <LoadingSpinner size="sm" label="Running tests..." />
                  </Show>
                  <Show when={hasTR() && testFiles().length === 0 && !isRunning()}>
                    <div class="test-note">Click "Scan" to discover test files</div>
                  </Show>

                  <For each={filteredFiles()}>
                    {(file) => (
                      <div class="test-file-group">
                        <div
                          class={`test-file-row ${file.status}`}
                          onClick={() => toggleExpand(file.path)}
                        >
                          <span class="test-arrow" style={{
                            transform: expandedFiles().has(file.path) ? "rotate(90deg)" : "rotate(0deg)"
                          }}>{"\u25B6"}</span>
                          <span class={`test-status-icon ${file.status}`}>{getStatusIcon(file.status)}</span>
                          <span class="test-file-name">{file.name}</span>
                          <Show when={getFileStats(file)}>
                            <span class="test-badge">{getFileStats(file)}</span>
                          </Show>
                          <button
                            class="test-run-single"
                            onClick={(e) => { e.stopPropagation(); runTestFile(file.path); }}
                            disabled={isRunning()}
                            title="Run this test file"
                          >{"\u25B6"}</button>
                        </div>
                        <Show when={expandedFiles().has(file.path) && file.tests.length > 0}>
                          <div class="test-cases">
                            <For each={file.tests}>
                              {(tc) => (
                                <div class={`test-case-row ${tc.status}`}>
                                  <span class={`test-case-icon ${tc.status}`}>{getStatusIcon(tc.status)}</span>
                                  <span class="test-case-name">{tc.name}</span>
                                  <Show when={tc.duration}>
                                    <span class="test-case-dur">{tc.duration}ms</span>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            );
          })()}
        </Show>

        <Show when={props.activePanel === "extensions"}>
          {(() => {
            const [extQuery, setExtQuery] = createSignal("");
            const [extList, setExtList] = createSignal<ExtensionState[]>(getExtensions());
            const [extDetail, setExtDetail] = createSignal<ExtensionState | null>(null);

            const unsub = onExtensionsChanged(() => setExtList(getExtensions()));
            onCleanup(unsub);

            const extIconColor = (id: string) => {
              if (id.includes("gixsis")) return "var(--accent-purple)";
              if (id.includes("typescript")) return "var(--accent-blue)";
              if (id.includes("theme-dark")) return "var(--text-primary)";
              if (id.includes("theme-light")) return "var(--accent-orange)";
              if (id.includes("git")) return "var(--accent-red)";
              if (id.includes("debug")) return "var(--accent-green)";
              if (id.includes("snippet")) return "var(--accent-teal, var(--accent-blue))";
              if (id.includes("terminal")) return "var(--text-secondary)";
              if (id.includes("mcp")) return "var(--accent-purple)";
              return "var(--accent-blue)";
            };

            const extIconLetter = (name: string) => name.charAt(0).toUpperCase();

            const filteredBuiltin = () => {
              const q = extQuery().toLowerCase();
              return extList().filter((e) => e.builtin && (!q || e.manifest.name.toLowerCase().includes(q) || e.manifest.description.toLowerCase().includes(q)));
            };

            const filteredUser = () => {
              const q = extQuery().toLowerCase();
              return extList().filter((e) => !e.builtin && (!q || e.manifest.name.toLowerCase().includes(q) || e.manifest.description.toLowerCase().includes(q)));
            };

            return (
              <div class="ext-panel">
                <div class="ext-search-row">
                  <input
                    class="ext-search"
                    type="text"
                    placeholder="Search extensions..."
                    value={extQuery()}
                    onInput={(e) => setExtQuery(e.currentTarget.value)}
                  />
                </div>

                <Show when={extDetail()}>
                  {(detail) => (
                    <div class="ext-detail">
                      <button class="ext-back-btn" onClick={() => setExtDetail(null)}>&larr; Back</button>
                      <div class="ext-detail-header">
                        <div class="ext-icon ext-icon-lg" style={{ background: extIconColor(detail().manifest.id) }}>
                          {extIconLetter(detail().manifest.name)}
                        </div>
                        <div class="ext-detail-meta">
                          <div class="ext-name">{detail().manifest.name}</div>
                          <div class="ext-desc">{detail().manifest.author} &middot; v{detail().manifest.version}</div>
                        </div>
                      </div>
                      <div class="ext-detail-desc">{detail().manifest.description}</div>
                      <Show when={detail().manifest.contributes?.commands}>
                        <div class="ext-detail-section">
                          <div class="ext-section-title">Commands</div>
                          <For each={detail().manifest.contributes!.commands!}>
                            {(cmd) => (
                              <div class="ext-command-row">
                                <span class="ext-command-id">{cmd.id}</span>
                                <span class="ext-command-title">{cmd.title}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={!detail().builtin}>
                        <div class="ext-detail-actions">
                          <button
                            class="ext-action-btn"
                            onClick={() => {
                              if (detail().enabled) disableExtension(detail().manifest.id);
                              else enableExtension(detail().manifest.id);
                              setExtDetail(getExtensions().find((e) => e.manifest.id === detail().manifest.id) ?? null);
                            }}
                          >
                            {detail().enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            class="ext-action-btn ext-action-danger"
                            onClick={() => {
                              uninstallExtension(detail().manifest.id);
                              setExtDetail(null);
                            }}
                          >
                            Uninstall
                          </button>
                        </div>
                      </Show>
                      <Show when={detail().builtin}>
                        <div class="ext-builtin-badge">Built-in</div>
                      </Show>
                    </div>
                  )}
                </Show>

                <Show when={!extDetail()}>
                  <div class="ext-section-title">
                    Installed ({extList().length})
                  </div>
                  <For each={filteredBuiltin()}>
                    {(ext) => (
                      <div class="ext-item" onClick={() => setExtDetail(ext)}>
                        <div class="ext-icon" style={{ background: extIconColor(ext.manifest.id) }}>
                          {extIconLetter(ext.manifest.name)}
                        </div>
                        <div class="ext-info">
                          <div class="ext-name">{ext.manifest.name}</div>
                          <div class="ext-desc">{ext.manifest.description}</div>
                        </div>
                        <span class="ext-version">{ext.manifest.version}</span>
                      </div>
                    )}
                  </For>
                  <Show when={filteredUser().length > 0}>
                    <div class="ext-section-title">User Installed</div>
                    <For each={filteredUser()}>
                      {(ext) => (
                        <div class="ext-item" onClick={() => setExtDetail(ext)}>
                          <div class="ext-icon" style={{ background: extIconColor(ext.manifest.id) }}>
                            {extIconLetter(ext.manifest.name)}
                          </div>
                          <div class="ext-info">
                            <div class="ext-name">{ext.manifest.name}</div>
                            <div class="ext-desc">{ext.manifest.description}</div>
                          </div>
                          <div class="ext-item-right">
                            <span class="ext-version">{ext.manifest.version}</span>
                            <Show when={!ext.enabled}>
                              <span class="ext-disabled-badge">Disabled</span>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                  <div class="ext-section-title">Marketplace — TerraForge Exchange</div>
                  {(() => {
                    const [mktQuery, setMktQuery] = createSignal("");
                    const [mktCategory, setMktCategory] = createSignal<MarketplaceCategory | null>(null);
                    const [mktView, setMktView] = createSignal<"featured" | "browse">("featured");
                    const [mktDetail, setMktDetail] = createSignal<MarketplaceExtension | null>(null);

                    const featured = () => getFeaturedExtensions();
                    const browseResults = () => searchMarketplace(mktQuery(), mktCategory() ?? undefined);
                    const categories = getMarketplaceCategories();

                    const formatDownloads = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
                    const renderStars = (rating: number) => {
                      const full = Math.floor(rating);
                      const half = rating - full >= 0.5;
                      return "\u2605".repeat(full) + (half ? "\u00BD" : "") + " " + rating.toFixed(1);
                    };

                    return (
                      <>
                        <div class="mkt-tabs">
                          <button class={`mkt-tab ${mktView() === "featured" ? "active" : ""}`} onClick={() => { setMktView("featured"); setMktDetail(null); }}>Featured</button>
                          <button class={`mkt-tab ${mktView() === "browse" ? "active" : ""}`} onClick={() => { setMktView("browse"); setMktDetail(null); }}>Browse</button>
                        </div>

                        <Show when={mktDetail()}>
                          {(detail) => (
                            <div class="mkt-detail">
                              <button class="ext-back-btn" onClick={() => setMktDetail(null)}>&larr; Back</button>
                              <div class="ext-detail-header">
                                <div class="ext-icon ext-icon-lg" style={{ background: detail().category === "themes" ? "var(--accent-purple)" : detail().category === "languages" ? "var(--accent-blue)" : "var(--accent-teal, var(--accent-blue))" }}>
                                  {detail().name.charAt(0).toUpperCase()}
                                </div>
                                <div class="ext-detail-meta">
                                  <div class="ext-name">{detail().name}</div>
                                  <div class="ext-desc">{detail().author} &middot; v{detail().version}</div>
                                </div>
                              </div>
                              <div class="ext-detail-desc">{detail().description}</div>
                              <div class="mkt-detail-stats">
                                <span class="mkt-downloads">{formatDownloads(detail().downloads)} downloads</span>
                                <span class="mkt-rating">{renderStars(detail().rating)}</span>
                              </div>
                              <div class="mkt-detail-tags">
                                <For each={detail().tags}>
                                  {(tag) => <span class="mkt-tag">{tag}</span>}
                                </For>
                              </div>
                              <button
                                class={`mkt-install-btn ${isMarketplaceInstalled(detail().id) ? "installed" : ""}`}
                                disabled={isMarketplaceInstalled(detail().id)}
                                onClick={() => { installFromMarketplace(detail()); setMktDetail({ ...detail(), installed: true } as MarketplaceExtension); }}
                              >
                                {isMarketplaceInstalled(detail().id) ? "Installed" : "Install"}
                              </button>
                            </div>
                          )}
                        </Show>

                        <Show when={!mktDetail()}>
                          <Show when={mktView() === "featured"}>
                            <For each={featured()}>
                              {(ext) => (
                                <div class="mkt-item" onClick={() => setMktDetail(ext)}>
                                  <div class="ext-icon" style={{ background: ext.category === "themes" ? "var(--accent-purple)" : ext.category === "languages" ? "var(--accent-blue)" : "var(--accent-teal, var(--accent-blue))" }}>
                                    {ext.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div class="ext-info">
                                    <div class="ext-name">{ext.name}</div>
                                    <div class="ext-desc">{ext.description}</div>
                                  </div>
                                  <div class="mkt-item-right">
                                    <span class="mkt-dl-count">{formatDownloads(ext.downloads)}</span>
                                    <Show when={isMarketplaceInstalled(ext.id)}>
                                      <span class="mkt-installed-badge">Installed</span>
                                    </Show>
                                  </div>
                                </div>
                              )}
                            </For>
                          </Show>

                          <Show when={mktView() === "browse"}>
                            <div class="mkt-search-row">
                              <input
                                class="ext-search"
                                type="text"
                                placeholder="Search marketplace..."
                                value={mktQuery()}
                                onInput={(e) => setMktQuery(e.currentTarget.value)}
                              />
                            </div>
                            <div class="mkt-category-row">
                              <button class={`mkt-cat-btn ${mktCategory() === null ? "active" : ""}`} onClick={() => setMktCategory(null)}>All</button>
                              <For each={categories}>
                                {(cat) => (
                                  <button class={`mkt-cat-btn ${mktCategory() === cat.id ? "active" : ""}`} onClick={() => setMktCategory(cat.id)}>{cat.label}</button>
                                )}
                              </For>
                            </div>
                            <div class="mkt-results-count">{browseResults().length} extensions</div>
                            <For each={browseResults()}>
                              {(ext) => (
                                <div class="mkt-item" onClick={() => setMktDetail(ext)}>
                                  <div class="ext-icon" style={{ background: ext.category === "themes" ? "var(--accent-purple)" : ext.category === "languages" ? "var(--accent-blue)" : "var(--accent-teal, var(--accent-blue))" }}>
                                    {ext.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div class="ext-info">
                                    <div class="ext-name">{ext.name}</div>
                                    <div class="ext-desc">{ext.description}</div>
                                  </div>
                                  <div class="mkt-item-right">
                                    <span class="mkt-dl-count">{formatDownloads(ext.downloads)}</span>
                                    <Show when={isMarketplaceInstalled(ext.id)}>
                                      <span class="mkt-installed-badge">Installed</span>
                                    </Show>
                                  </div>
                                </div>
                              )}
                            </For>
                          </Show>
                        </Show>
                      </>
                    );
                  })()}
                </Show>
              </div>
            );
          })()}
        </Show>
      </div>

      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            items={menu().items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>

      <style>{`
        .sidebar {
          width: 100%;
          height: 100%;
          background: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .sidebar-header {
          height: var(--tab-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }
        .sidebar-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
        }
        .sidebar-header-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .sidebar-header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sidebar-header-btn.active { color: var(--accent-blue); }

        /* Explorer filter */
        .tree-filter-row {
          display: flex;
          align-items: center;
          padding: var(--space-1) var(--space-3);
          gap: var(--space-1);
          border-bottom: 1px solid var(--border-subtle);
        }
        .tree-filter-input {
          flex: 1;
          height: 24px;
          background: var(--bg-input, var(--bg-base));
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 0 var(--space-2);
          font-size: var(--text-xs);
          color: var(--text-primary);
          font-family: var(--font-ui);
          outline: none;
        }
        .tree-filter-input:focus { border-color: var(--accent-blue); }
        .tree-filter-clear {
          width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; border-radius: var(--radius-sm);
          color: var(--text-tertiary); cursor: pointer; font-size: 14px;
        }
        .tree-filter-clear:hover { color: var(--text-primary); background: var(--bg-hover); }

        /* Open Editors section */
        .open-editors-section {
          border-bottom: 1px solid var(--border-subtle);
        }
        .open-editors-header {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-3);
          cursor: pointer;
          user-select: none;
        }
        .open-editors-header:hover { background: var(--bg-hover); }
        .open-editors-title {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-secondary);
          letter-spacing: 0.06em;
          flex: 1;
        }
        .open-editors-badge {
          font-size: 10px;
          color: var(--text-tertiary);
          background: var(--bg-hover);
          padding: 0 5px;
          border-radius: 8px;
          min-width: 16px;
          text-align: center;
        }
        .open-editors-list {
          padding-bottom: var(--space-1);
        }
        .open-editors-item {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 2px var(--space-3) 2px var(--space-4);
          cursor: pointer;
          font-size: var(--text-xs);
          color: var(--text-secondary);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .open-editors-item:hover { background: var(--bg-hover); }
        .open-editors-item.active { color: var(--text-primary); }
        .open-editors-close {
          width: 16px; height: 16px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; border-radius: var(--radius-sm);
          color: var(--text-disabled); cursor: pointer; font-size: 12px;
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .open-editors-item:hover .open-editors-close { opacity: 1; }
        .open-editors-close:hover { color: var(--text-primary); background: var(--bg-hover); }
        .open-editors-icon { font-size: 12px; flex-shrink: 0; }
        .open-editors-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2) 0;
        }
        .tree-node {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 26px;
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          transition: background var(--duration-fast) var(--ease-out);
          padding-right: var(--space-2);
        }
        .tree-node:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .tree-node.drag-over {
          background: rgba(41, 151, 255, 0.12);
          outline: 1px dashed var(--accent-blue, #2997ff);
          outline-offset: -1px;
        }
        .tree-arrow {
          font-size: 8px;
          color: var(--text-tertiary);
          transition: transform var(--duration-fast) var(--ease-out);
          width: 12px;
          text-align: center;
        }
        .tree-icon {
          font-size: 14px;
          width: 18px;
          text-align: center;
        }
        .tree-name {
          flex: 1;
        }
        .git-badge {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 700;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          line-height: 1;
          margin-left: auto;
          margin-right: 2px;
          opacity: 0.9;
          letter-spacing: 0.02em;
          user-select: none;
        }
        .tree-inline-input {
          flex: 1;
          height: 20px;
          background: var(--bg-input);
          border: 1px solid var(--accent-blue);
          border-radius: 2px;
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          padding: 0 4px;
          outline: none;
          min-width: 0;
        }

        /* File tree mount transition */
        .file-tree-container {
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
        }
        .file-tree-container.mounted {
          opacity: 1;
          transform: translateY(0);
        }
        /* Root folder node — VS Code parity */
        .tree-root-node {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 26px;
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--text-primary);
          padding-left: 8px;
          padding-right: var(--space-2);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .tree-root-node:hover {
          background: var(--bg-hover);
        }
        .tree-root-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Open Folder Button */
        .open-folder-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: calc(100% - var(--space-4));
          margin: var(--space-2) var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: rgba(41, 151, 255, 0.08);
          border: 1px dashed rgba(41, 151, 255, 0.3);
          border-radius: var(--radius-md);
          color: var(--accent-blue);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .open-folder-btn:hover {
          background: rgba(41, 151, 255, 0.15);
          border-color: var(--accent-blue);
        }
        .open-folder-btn svg {
          flex-shrink: 0;
          opacity: 0.7;
        }

        /* Outline Section */
        .outline-section {
          margin-top: var(--space-2);
          border-top: 1px solid var(--border-subtle);
          padding-top: var(--space-1);
        }
        .outline-header {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 28px;
          padding: 0 var(--space-3);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .outline-header:hover {
          background: var(--bg-hover);
        }
        .outline-arrow {
          font-size: 8px;
          color: var(--text-tertiary);
          transition: transform var(--duration-fast) var(--ease-out);
          width: 12px;
          text-align: center;
          flex-shrink: 0;
        }
        .outline-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
          flex: 1;
        }
        .outline-badge {
          font-size: 10px;
          background: var(--bg-card);
          color: var(--text-tertiary);
          border-radius: 8px;
          padding: 0 6px;
          height: 16px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .outline-lsp-badge {
          font-size: 9px;
          background: var(--accent-green);
          color: #000;
          border-radius: 4px;
          padding: 0 4px;
          height: 14px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .outline-toolbar {
          display: flex;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-3);
        }
        .outline-filter {
          flex: 1;
          height: 22px;
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          padding: 0 var(--space-2);
          outline: none;
        }
        .outline-filter:focus {
          border-color: var(--accent-blue);
        }
        .outline-sort {
          height: 22px;
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 10px;
          padding: 0 var(--space-1);
          outline: none;
          cursor: pointer;
        }
        .outline-list {
          padding: var(--space-1) 0;
          max-height: 400px;
          overflow-y: auto;
        }
        .outline-item {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 24px;
          padding: 0 var(--space-3) 0 12px;
          cursor: pointer;
          font-size: var(--text-xs);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .outline-item:hover {
          background: var(--bg-hover);
        }
        .outline-parent {
          font-weight: 500;
        }
        .outline-expand {
          font-size: 7px;
          color: var(--text-tertiary);
          cursor: pointer;
          width: 12px;
          text-align: center;
          flex-shrink: 0;
          transition: transform var(--duration-fast) var(--ease-out);
        }
        .outline-indent {
          width: 12px;
          flex-shrink: 0;
        }
        .outline-sym-icon {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 10px;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .outline-sym-name {
          color: var(--text-secondary);
          font-family: var(--font-mono);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .outline-sym-detail {
          color: var(--text-disabled);
          font-family: var(--font-mono);
          font-size: 10px;
          margin-left: var(--space-1);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100px;
        }
        .outline-sym-line {
          color: var(--text-disabled);
          font-family: var(--font-mono);
          font-size: 10px;
          flex-shrink: 0;
        }
        .outline-empty {
          padding: var(--space-2) var(--space-3);
          font-size: 11px;
          color: var(--text-disabled);
          font-style: italic;
        }

        /* Timeline Section */
        .timeline-section {
          border-top: 1px solid var(--border-subtle);
        }
        .timeline-header {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          cursor: pointer;
          user-select: none;
        }
        .timeline-header:hover { background: var(--bg-hover); }
        .timeline-list {
          max-height: 200px;
          overflow-y: auto;
        }
        .timeline-entry {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 2px var(--space-3);
          font-size: 11px;
          cursor: default;
        }
        .timeline-entry:hover { background: var(--bg-hover); }
        .timeline-icon { font-size: 12px; flex-shrink: 0; }
        .timeline-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-secondary);
        }
        .timeline-time {
          font-size: 10px;
          color: var(--text-disabled);
          flex-shrink: 0;
        }

        /* Search Panel */
        .search-panel {
          padding: var(--space-2) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .search-input-row {
          display: flex;
          gap: var(--space-1);
          align-items: center;
        }
        .search-input {
          flex: 1;
          height: 28px;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          padding: 0 var(--space-2);
          outline: none;
          transition: border-color var(--duration-fast) var(--ease-out);
        }
        .search-input:focus {
          border-color: var(--accent-blue);
        }
        .search-input::placeholder {
          color: var(--text-disabled);
        }
        .search-option-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .search-option-btn:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }
        .search-option-btn.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }
        .search-exclude-row {
          margin-top: var(--space-1);
        }
        .search-exclude-input {
          font-size: 11px;
          height: 24px;
        }
        .search-replace-toggle {
          width: 16px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-disabled);
          font-size: 8px;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform var(--duration-fast) var(--ease-out);
        }
        .search-replace-toggle.expanded {
          transform: rotate(90deg);
        }
        .search-replace-toggle:hover {
          color: var(--text-secondary);
        }
        .search-replace-row {
          display: flex;
          gap: var(--space-1);
          align-items: center;
          padding-left: 16px;
        }
        .search-replace-btn {
          height: 28px;
          padding: 0 var(--space-2);
          background: rgba(41, 151, 255, 0.08);
          border: 1px solid rgba(41, 151, 255, 0.2);
          border-radius: var(--radius-sm);
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .search-replace-btn:hover:not(:disabled) {
          background: rgba(41, 151, 255, 0.15);
        }
        .search-replace-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .search-file-replace-btn {
          width: 20px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-disabled);
          font-size: 12px;
          cursor: pointer;
          flex-shrink: 0;
          border-radius: var(--radius-sm);
          margin-left: auto;
        }
        .search-file-replace-btn:hover {
          background: var(--bg-hover);
          color: var(--accent-blue);
        }
        .search-summary {
          font-size: var(--text-xs);
          padding: var(--space-1) 0;
        }
        .search-count {
          color: var(--text-tertiary);
        }
        .search-no-results {
          color: var(--text-disabled);
          font-style: italic;
        }
        .search-results {
          display: flex;
          flex-direction: column;
        }
        .search-file-group {
          margin-bottom: var(--space-1);
        }
        .search-file-header {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 24px;
          padding: 0 var(--space-1);
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .search-file-header:hover {
          background: var(--bg-hover);
        }
        .search-file-arrow {
          font-size: 7px;
          color: var(--text-tertiary);
          transition: transform var(--duration-fast) var(--ease-out);
          width: 10px;
          text-align: center;
          flex-shrink: 0;
        }
        .search-file-icon {
          font-size: 9px;
          flex-shrink: 0;
        }
        .search-file-name {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
          flex-shrink: 0;
        }
        .search-file-path {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          flex: 1;
          margin-left: var(--space-1);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .search-match-badge {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-tertiary);
          background: var(--bg-card);
          border-radius: 8px;
          padding: 0 6px;
          height: 16px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .search-file-matches {
          padding-left: var(--space-3);
        }
        .search-result-line {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 22px;
          padding: 0 var(--space-2);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          transition: background var(--duration-fast) var(--ease-out);
          overflow: hidden;
        }
        .search-result-line:hover {
          background: var(--bg-hover);
        }
        .search-line-num {
          color: var(--text-disabled);
          min-width: 24px;
          text-align: right;
          flex-shrink: 0;
        }
        .match-text {
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .match-highlight {
          background: rgba(255, 159, 10, 0.25);
          color: var(--accent-orange);
          border-radius: 2px;
          padding: 0 1px;
        }
        .panel-placeholder {
          padding: var(--space-4);
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          text-align: center;
        }

        /* Git Panel */
        .git-panel {
          padding: var(--space-2) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .git-branch-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-1) 0;
        }
        .git-branch {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .git-branch-name {
          font-family: var(--font-mono);
          font-weight: 600;
        }
        .branch-switcher {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin: var(--space-1) 0;
          background: var(--bg-elevated, var(--bg-card));
          overflow: hidden;
        }
        .branch-switcher-create {
          display: flex;
          gap: var(--space-1);
          padding: var(--space-1);
          border-bottom: 1px solid var(--border-subtle);
        }
        .branch-input {
          flex: 1;
          background: var(--bg-input, var(--bg-base));
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 3px 6px;
          font-size: 11px;
          color: var(--text-primary);
          font-family: var(--font-mono);
          outline: none;
        }
        .branch-input:focus { border-color: var(--accent-blue); }
        .branch-list {
          max-height: 150px;
          overflow-y: auto;
        }
        .branch-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: 100%;
          padding: 4px var(--space-2);
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 11px;
          font-family: var(--font-mono);
          cursor: pointer;
          text-align: left;
        }
        .branch-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .branch-item.active { color: var(--accent-blue); font-weight: 600; }
        .branch-current-badge {
          font-size: 9px;
          background: var(--accent-blue);
          color: white;
          padding: 0 4px;
          border-radius: 3px;
          margin-left: auto;
        }
        .git-icon-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .git-icon-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .git-icon-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .git-error {
          font-size: var(--text-xs);
          color: var(--accent-red);
          background: rgba(255, 69, 58, 0.08);
          border: 1px solid rgba(255, 69, 58, 0.2);
          border-radius: var(--radius-sm);
          padding: var(--space-1) var(--space-2);
        }
        .git-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-1) 0;
        }
        .git-section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .git-section-actions {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .git-badge {
          font-size: 10px;
          background: var(--bg-card);
          color: var(--text-tertiary);
          border-radius: 8px;
          padding: 0 6px;
          height: 16px;
          display: flex;
          align-items: center;
        }
        .git-empty {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          font-style: italic;
          padding: var(--space-1) 0;
        }
        .git-log-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          height: 24px;
          padding: 0 var(--space-3);
          font-size: var(--text-xs);
          cursor: default;
        }
        .git-log-item:hover {
          background: var(--bg-hover);
        }
        .git-log-hash {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--accent-blue);
          flex-shrink: 0;
          font-weight: 600;
        }
        .git-log-message {
          flex: 1;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .git-log-date {
          font-size: 10px;
          color: var(--text-disabled);
          flex-shrink: 0;
          white-space: nowrap;
        }
        .git-commit-area {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .git-commit-input {
          height: 28px;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-xs);
          padding: 0 var(--space-2);
          outline: none;
          transition: border-color var(--duration-fast) var(--ease-out);
        }
        .git-commit-input:focus {
          border-color: var(--accent-blue);
        }
        .git-commit-input:disabled {
          opacity: 0.5;
        }
        .git-commit-btn {
          height: 26px;
          background: var(--accent-blue);
          border: none;
          border-radius: var(--radius-sm);
          color: white;
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .git-commit-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .git-commit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .git-file-item {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          height: 24px;
          padding: 0 var(--space-1);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          transition: background var(--duration-fast) var(--ease-out);
        }
        .git-file-item:hover {
          background: var(--bg-hover);
        }
        .git-file-item:hover .git-file-action {
          opacity: 1;
        }
        .git-file-status {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 10px;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
        }
        .git-file-name {
          color: var(--text-primary);
          font-weight: 500;
          flex-shrink: 0;
          max-width: 60%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .git-file-dir {
          color: var(--text-disabled);
          font-size: 10px;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .git-file-action {
          opacity: 0;
          width: 18px;
          height: 18px;
          font-size: 14px;
          font-weight: 700;
        }
        .git-note, .ext-note {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-align: center;
          padding: var(--space-3) var(--space-2);
          font-style: italic;
        }

        /* Extensions Panel */
        .ext-panel {
          padding: var(--space-2) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .ext-search-row {
          margin-bottom: var(--space-1);
        }
        .ext-search {
          width: 100%;
          height: 28px;
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-xs);
          padding: 0 var(--space-2);
          outline: none;
          box-sizing: border-box;
        }
        .ext-search:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ext-section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: var(--space-1) 0;
        }
        .ext-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .ext-item:hover {
          background: var(--bg-hover);
        }
        .ext-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          color: white;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-weight: 700;
          flex-shrink: 0;
        }
        .ext-info {
          flex: 1;
          min-width: 0;
        }
        .ext-name {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
        }
        .ext-desc {
          font-size: 10px;
          color: var(--text-disabled);
        }
        .ext-version {
          font-size: 10px;
          font-family: var(--font-mono);
          color: var(--text-disabled);
          flex-shrink: 0;
        }
        .ext-search:focus {
          border-color: var(--accent-blue);
        }
        .ext-item-right {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          flex-shrink: 0;
        }
        .ext-disabled-badge {
          font-size: 9px;
          padding: 1px 4px;
          border-radius: var(--radius-sm);
          background: var(--bg-hover);
          color: var(--text-disabled);
        }
        .ext-icon-lg {
          width: 40px;
          height: 40px;
          font-size: var(--text-md);
        }
        .ext-back-btn {
          background: transparent;
          border: none;
          color: var(--accent-blue);
          font-size: var(--text-xs);
          cursor: pointer;
          padding: var(--space-1) 0;
          margin-bottom: var(--space-2);
        }
        .ext-back-btn:hover {
          text-decoration: underline;
        }
        .ext-detail {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .ext-detail-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .ext-detail-meta {
          flex: 1;
          min-width: 0;
        }
        .ext-detail-desc {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .ext-detail-section {
          margin-top: var(--space-2);
        }
        .ext-command-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 24px;
          padding: 0 var(--space-2);
          border-radius: var(--radius-sm);
        }
        .ext-command-row:hover {
          background: var(--bg-hover);
        }
        .ext-command-id {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-tertiary);
        }
        .ext-command-title {
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .ext-detail-actions {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-2);
        }
        .ext-action-btn {
          height: 24px;
          padding: 0 var(--space-3);
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .ext-action-btn:hover {
          background: var(--bg-input);
          color: var(--text-primary);
        }
        .ext-action-danger:hover {
          color: var(--accent-red);
          border-color: var(--accent-red);
        }
        .ext-builtin-badge {
          font-size: var(--text-xs);
          color: var(--accent-green);
          font-weight: 600;
          margin-top: var(--space-2);
        }

        /* Marketplace */
        .mkt-tabs {
          display: flex;
          gap: var(--space-1);
          margin-bottom: var(--space-2);
        }
        .mkt-tab {
          flex: 1;
          height: 26px;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .mkt-tab.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }
        .mkt-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .mkt-item:hover {
          background: var(--bg-hover);
        }
        .mkt-item-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          flex-shrink: 0;
        }
        .mkt-dl-count {
          font-size: 9px;
          font-family: var(--font-mono);
          color: var(--text-disabled);
        }
        .mkt-installed-badge {
          font-size: 8px;
          padding: 1px 4px;
          border-radius: var(--radius-sm);
          background: rgba(48, 209, 88, 0.15);
          color: var(--accent-green);
          font-weight: 600;
        }
        .mkt-search-row {
          margin-bottom: var(--space-2);
        }
        .mkt-category-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: var(--space-2);
        }
        .mkt-cat-btn {
          height: 22px;
          padding: 0 6px;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-disabled);
          font-size: 10px;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .mkt-cat-btn.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }
        .mkt-cat-btn:hover:not(.active) {
          color: var(--text-secondary);
          border-color: var(--text-disabled);
        }
        .mkt-results-count {
          font-size: 10px;
          color: var(--text-disabled);
          margin-bottom: var(--space-1);
        }
        .mkt-detail {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .mkt-detail-stats {
          display: flex;
          gap: var(--space-3);
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .mkt-downloads {
          color: var(--text-tertiary);
        }
        .mkt-rating {
          color: var(--accent-orange);
        }
        .mkt-detail-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .mkt-tag {
          font-size: 9px;
          padding: 1px 6px;
          border-radius: 10px;
          background: var(--bg-hover);
          color: var(--text-tertiary);
        }
        .mkt-install-btn {
          height: 28px;
          padding: 0 var(--space-4);
          background: var(--accent-blue);
          border: none;
          border-radius: var(--radius-sm);
          color: white;
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          align-self: flex-start;
        }
        .mkt-install-btn:hover:not(:disabled) {
          filter: brightness(1.1);
        }
        .mkt-install-btn.installed {
          background: var(--bg-hover);
          color: var(--accent-green);
          cursor: default;
        }

        /* Test Explorer */
        .test-explorer {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .test-toolbar {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .test-runner-select {
          height: 24px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 10px;
          flex: 1;
        }
        .test-action-btn {
          height: 24px;
          padding: 0 var(--space-2);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          background: var(--bg-input);
          transition: all var(--duration-fast) var(--ease-out);
        }
        .test-action-btn:hover:not(:disabled) { background: var(--bg-hover); }
        .test-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .test-run-all-btn { background: var(--accent-green); color: #fff; border-color: var(--accent-green); }
        .test-run-all-btn:hover:not(:disabled) { opacity: 0.9; }
        .test-summary-bar {
          display: flex;
          gap: var(--space-3);
          padding: var(--space-1) var(--space-3);
          font-size: 10px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .test-sum-passed { color: var(--accent-green); }
        .test-sum-failed { color: var(--accent-red); }
        .test-sum-skipped { color: var(--text-disabled); }
        .test-sum-total { color: var(--text-tertiary); margin-left: auto; }
        .test-error {
          padding: var(--space-2) var(--space-3);
          font-size: 10px;
          color: var(--accent-red);
          border-bottom: 1px solid var(--border-subtle);
        }
        .test-filter {
          width: calc(100% - var(--space-6));
          margin: var(--space-2) var(--space-3);
          height: 24px;
          padding: 0 var(--space-2);
          background: var(--bg-input);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 10px;
          outline: none;
          flex-shrink: 0;
        }
        .test-filter:focus { border-color: var(--accent-blue); }
        .test-list {
          flex: 1;
          overflow-y: auto;
        }
        .test-note {
          font-size: 10px;
          color: var(--text-disabled);
          text-align: center;
          padding: var(--space-4);
          font-style: italic;
        }
        .test-file-group {
          border-bottom: 1px solid var(--border-subtle);
        }
        .test-file-row {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 26px;
          padding: 0 var(--space-2);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .test-file-row:hover { background: var(--bg-hover); }
        .test-arrow {
          font-size: 8px;
          width: 12px;
          text-align: center;
          flex-shrink: 0;
          transition: transform var(--duration-fast) var(--ease-out);
          color: var(--text-tertiary);
        }
        .test-status-icon {
          width: 14px;
          text-align: center;
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 700;
        }
        .test-status-icon.passed { color: var(--accent-green); }
        .test-status-icon.failed { color: var(--accent-red); }
        .test-status-icon.running { color: var(--accent-blue); }
        .test-status-icon.error { color: var(--accent-orange); }
        .test-file-name {
          flex: 1;
          font-size: 11px;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .test-badge {
          font-size: 9px;
          background: var(--bg-card);
          color: var(--text-tertiary);
          border-radius: 8px;
          padding: 0 5px;
          height: 14px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .test-run-single {
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          color: var(--text-tertiary);
          font-size: 8px;
          cursor: pointer;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
          opacity: 0;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .test-file-row:hover .test-run-single { opacity: 1; }
        .test-run-single:hover { background: var(--bg-active); color: var(--accent-green); }
        .test-cases {
          padding-left: 20px;
        }
        .test-case-row {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 22px;
          padding: 0 var(--space-2);
          font-size: 10px;
          cursor: default;
        }
        .test-case-row:hover { background: var(--bg-hover); }
        .test-case-icon {
          width: 12px;
          text-align: center;
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 700;
        }
        .test-case-icon.passed { color: var(--accent-green); }
        .test-case-icon.failed { color: var(--accent-red); }
        .test-case-icon.skipped { color: var(--text-disabled); }
        .test-case-name {
          flex: 1;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .test-case-dur {
          color: var(--text-disabled);
          font-size: 9px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
