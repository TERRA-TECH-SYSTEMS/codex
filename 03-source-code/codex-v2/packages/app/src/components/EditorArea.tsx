// ============================================================================
// CodeEX v2 — Editor Area (Tabs + CodeMirror 6)
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { ContextMenu } from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, hoverTooltip } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment, moveLineUp, moveLineDown, copyLineUp, copyLineDown, selectAll, indentSelection } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, syntaxTree } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap, snippet, type CompletionContext, type Completion } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches, findNext as cmFindNext, findPrevious as cmFindPrev, replaceNext as cmReplaceNext, replaceAll as cmReplaceAll, openSearchPanel, closeSearchPanel, SearchQuery, setSearchQuery, getSearchQuery, selectNextOccurrence } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import { getFS } from "~/lib/filesystem";
import { notify } from "~/lib/notifications";
import { getFileIcon } from "~/lib/file-icons";
import { getFileGitStatus, getGitStatusColor } from "~/lib/git-status-store";
import { bracketColorization, minimapPlugin, stickyScrollPlugin } from "~/lib/editor-extensions";
import { lspExtensions, lspCompletionExtension } from "~/lib/lsp-extensions";
import { getLspClient } from "~/lib/lsp-client";
import { debugExtensions } from "~/lib/debug-extensions";
import { blameExtensions } from "~/lib/git-blame";
import { mergeConflictExtensions } from "~/lib/merge-conflict";
import { gitGutterExtensions, computeGitChanges, setGitChanges } from "~/lib/git-gutter";
import { codeLensExtensions } from "~/lib/code-lens";
import { linkedEditingExtensions } from "~/lib/linked-editing";
import { codeActionsExtensions } from "~/lib/code-actions";
import { indentGuidesExtensions } from "~/lib/indent-guides";
import { getUserSnippetsForFile } from "~/lib/user-snippets";
import { FindReplace } from "./FindReplace";
import { WelcomeTab } from "./WelcomeTab";
import { SearchEditor } from "./SearchEditor";
import { ProgressBar } from "./ProgressBar";
import { getSettings, type EditorSettings } from "~/lib/settings-store";
import type { Extension } from "@codemirror/state";

interface Props {
  openFiles: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onReorderFiles?: (files: string[]) => void;
}

// Compartments for dynamic settings reconfiguration
const fontSizeCompartment = new Compartment();
const tabSizeCompartment = new Compartment();
const lineWrapCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const minimapCompartment = new Compartment();
const bracketColorCompartment = new Compartment();
const stickyScrollCompartment = new Compartment();

/** Build the dynamic font size theme from current settings. */
function buildFontSizeTheme(size: number): Extension {
  return EditorView.theme({
    "&": { fontSize: `${size}px` },
    ".cm-content": { fontSize: `${size}px` },
  });
}

/** CodeEX dark theme extending oneDark with Apple aesthetic overrides. */
const codexTheme = EditorView.theme({
  "&": {
    backgroundColor: "#0a0a0a",
    color: "#f5f5f7",
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    fontSize: "13px",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#2997ff",
    padding: "8px 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#2997ff",
    borderLeftWidth: "2px",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  ".cm-gutters": {
    backgroundColor: "#0a0a0a",
    color: "#48484a",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 16px",
    minWidth: "40px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(41, 151, 255, 0.2)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(41, 151, 255, 0.15)",
    outline: "1px solid rgba(41, 151, 255, 0.4)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(255, 159, 10, 0.2)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(255, 159, 10, 0.4)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#a1a1a6",
  },
}, { dark: true });

/** Indent guides via CSS background gradient on .cm-line elements. */
const indentGuideTheme = EditorView.theme({
  ".cm-line": {
    backgroundImage:
      "repeating-linear-gradient(to right, transparent, transparent calc(2ch - 1px), rgba(255,255,255,0.04) calc(2ch - 1px), rgba(255,255,255,0.04) 2ch)",
    backgroundPosition: "0 0",
  },
}, { dark: true });

/** Map syntax tree node names to friendly descriptions for hover tooltip. */
const nodeDescriptions: Record<string, string> = {
  VariableDefinition: "variable",
  VariableDeclaration: "variable declaration",
  VariableName: "variable",
  PropertyName: "property",
  PropertyDefinition: "property",
  FunctionDeclaration: "function",
  MethodDeclaration: "method",
  ArrowFunction: "arrow function",
  ClassDeclaration: "class",
  TypeDefinition: "type alias",
  InterfaceDeclaration: "interface",
  EnumDeclaration: "enum",
  ImportDeclaration: "import",
  ExportDeclaration: "export",
  CallExpression: "function call",
  NewExpression: "constructor call",
  String: "string",
  Number: "number",
  Boolean: "boolean",
  RegExp: "regular expression",
  TemplateString: "template literal",
  LineComment: "comment",
  BlockComment: "comment",
  Keyword: "keyword",
  TypeName: "type",
  TypeAnnotation: "type annotation",
  JSXElement: "JSX element",
  JSXSelfClosingTag: "JSX element",
  JSXOpenTag: "JSX tag",
  JSXAttribute: "JSX attribute",
};

/** Hover tooltip extension — shows syntax token info on hover. */
const hoverTooltipExt = hoverTooltip((view, pos) => {
  const tree = syntaxTree(view.state);
  const node = tree.resolveInner(pos, 1);
  if (!node || node.name === "Script" || node.name === "Program") return null;

  // Get the word at position for display
  const word = view.state.doc.sliceString(node.from, Math.min(node.to, node.from + 80));
  if (!word.trim()) return null;

  // Walk up to find the most descriptive ancestor
  let desc = nodeDescriptions[node.name];
  let contextNode = node;
  if (!desc) {
    let parent = node.parent;
    for (let i = 0; i < 3 && parent; i++) {
      if (nodeDescriptions[parent.name]) {
        desc = nodeDescriptions[parent.name];
        contextNode = parent;
        break;
      }
      parent = parent.parent;
    }
  }
  if (!desc) desc = node.name.replace(/([A-Z])/g, " $1").trim().toLowerCase();

  return {
    pos: node.from,
    end: node.to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-hover-tooltip";

      const typeSpan = document.createElement("span");
      typeSpan.className = "cm-hover-type";
      typeSpan.textContent = desc!;
      dom.appendChild(typeSpan);

      // Show the token text for short tokens
      if (word.length <= 60 && word.length > 0) {
        const codeSpan = document.createElement("code");
        codeSpan.className = "cm-hover-code";
        codeSpan.textContent = word;
        dom.appendChild(codeSpan);
      }

      // Show syntax tree path for context
      const parts: string[] = [];
      let p = node.parent;
      for (let i = 0; i < 2 && p; i++) {
        if (p.name !== "Script" && p.name !== "Program") parts.unshift(p.name);
        p = p.parent;
      }
      if (parts.length > 0) {
        const pathSpan = document.createElement("span");
        pathSpan.className = "cm-hover-path";
        pathSpan.textContent = parts.join(" > ");
        dom.appendChild(pathSpan);
      }

      return { dom };
    },
  };
}, { hoverTime: 400 });

/** Hover tooltip styles. */
const hoverTooltipTheme = EditorView.theme({
  ".cm-tooltip": {
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    backgroundColor: "#1a1a1a",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
    maxWidth: "400px",
  },
  ".cm-hover-tooltip": {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "6px 10px",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize: "12px",
    lineHeight: "1.4",
  },
  ".cm-hover-type": {
    color: "#bf5af2",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  ".cm-hover-code": {
    color: "#f5f5f7",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: "2px 6px",
    borderRadius: "3px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-hover-path": {
    color: "#636366",
    fontSize: "10px",
  },
}, { dark: true });

/** Snippet definitions for language-specific code snippets. */
interface SnippetDef { label: string; detail: string; template: string; }

const jsSnippets: SnippetDef[] = [
  { label: "fn", detail: "function", template: "function ${name}(${params}) {\n\t${}\n}" },
  { label: "afn", detail: "async function", template: "async function ${name}(${params}) {\n\t${}\n}" },
  { label: "arrow", detail: "arrow function", template: "const ${name} = (${params}) => {\n\t${}\n};" },
  { label: "if", detail: "if statement", template: "if (${condition}) {\n\t${}\n}" },
  { label: "ife", detail: "if-else", template: "if (${condition}) {\n\t${}\n} else {\n\t${}\n}" },
  { label: "for", detail: "for loop", template: "for (let ${i} = 0; ${i} < ${length}; ${i}++) {\n\t${}\n}" },
  { label: "forof", detail: "for...of", template: "for (const ${item} of ${iterable}) {\n\t${}\n}" },
  { label: "forin", detail: "for...in", template: "for (const ${key} in ${object}) {\n\t${}\n}" },
  { label: "while", detail: "while loop", template: "while (${condition}) {\n\t${}\n}" },
  { label: "try", detail: "try-catch", template: "try {\n\t${}\n} catch (${err}) {\n\t${}\n}" },
  { label: "cl", detail: "console.log", template: "console.log(${});" },
  { label: "cw", detail: "console.warn", template: "console.warn(${});" },
  { label: "ce", detail: "console.error", template: "console.error(${});" },
  { label: "imp", detail: "import", template: "import { ${} } from \"${module}\";" },
  { label: "impd", detail: "import default", template: "import ${name} from \"${module}\";" },
  { label: "exp", detail: "export", template: "export { ${} };" },
  { label: "expd", detail: "export default", template: "export default ${};" },
  { label: "class", detail: "class", template: "class ${Name} {\n\tconstructor(${params}) {\n\t\t${}\n\t}\n}" },
  { label: "promise", detail: "new Promise", template: "new Promise((resolve, reject) => {\n\t${}\n})" },
  { label: "map", detail: ".map()", template: "${array}.map((${item}) => {\n\t${}\n})" },
  { label: "filter", detail: ".filter()", template: "${array}.filter((${item}) => ${condition})" },
  { label: "reduce", detail: ".reduce()", template: "${array}.reduce((${acc}, ${item}) => {\n\t${}\n}, ${initial})" },
];

const tsSnippets: SnippetDef[] = [
  ...jsSnippets,
  { label: "interface", detail: "interface", template: "interface ${Name} {\n\t${prop}: ${type};\n}" },
  { label: "type", detail: "type alias", template: "type ${Name} = ${};" },
  { label: "enum", detail: "enum", template: "enum ${Name} {\n\t${},\n}" },
  { label: "generic", detail: "generic function", template: "function ${name}<${T}>(${param}: ${T}): ${T} {\n\t${}\n}" },
];

const pySnippets: SnippetDef[] = [
  { label: "def", detail: "function", template: "def ${name}(${params}):\n\t${pass}" },
  { label: "adef", detail: "async function", template: "async def ${name}(${params}):\n\t${pass}" },
  { label: "class", detail: "class", template: "class ${Name}:\n\tdef __init__(self, ${params}):\n\t\t${pass}" },
  { label: "if", detail: "if statement", template: "if ${condition}:\n\t${pass}" },
  { label: "ife", detail: "if-else", template: "if ${condition}:\n\t${}\nelse:\n\t${}" },
  { label: "for", detail: "for loop", template: "for ${item} in ${iterable}:\n\t${pass}" },
  { label: "while", detail: "while loop", template: "while ${condition}:\n\t${pass}" },
  { label: "try", detail: "try-except", template: "try:\n\t${}\nexcept ${Exception} as ${e}:\n\t${pass}" },
  { label: "with", detail: "with statement", template: "with ${expression} as ${name}:\n\t${}" },
  { label: "imp", detail: "import", template: "from ${module} import ${}" },
  { label: "pr", detail: "print", template: "print(${})"},
];

const rustSnippets: SnippetDef[] = [
  { label: "fn", detail: "function", template: "fn ${name}(${params}) -> ${ReturnType} {\n\t${}\n}" },
  { label: "pfn", detail: "pub function", template: "pub fn ${name}(${params}) -> ${ReturnType} {\n\t${}\n}" },
  { label: "struct", detail: "struct", template: "struct ${Name} {\n\t${field}: ${Type},\n}" },
  { label: "impl", detail: "impl block", template: "impl ${Name} {\n\t${}\n}" },
  { label: "trait", detail: "trait", template: "trait ${Name} {\n\tfn ${method}(&self) -> ${};\n}" },
  { label: "match", detail: "match", template: "match ${value} {\n\t${pattern} => ${},\n\t_ => ${},\n}" },
  { label: "if", detail: "if let", template: "if let ${Some}(${val}) = ${expr} {\n\t${}\n}" },
  { label: "println", detail: "println!", template: "println!(\"${}\", ${});" },
];

/** Get snippets for a file extension. */
function getSnippetsForFile(filePath: string): SnippetDef[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": return tsSnippets;
    case "js": case "jsx": case "mjs": case "cjs": return jsSnippets;
    case "py": return pySnippets;
    case "rs": return rustSnippets;
    default: return jsSnippets;
  }
}

/** Snippet completion source for CodeMirror autocompletion. */
function snippetCompletion(filePath: string) {
  const builtinDefs = getSnippetsForFile(filePath);
  const userDefs = getUserSnippetsForFile(filePath);
  return (context: CompletionContext) => {
    const word = context.matchBefore(/\w+/);
    if (!word) return null;
    const q = word.text.toLowerCase();
    const options: Completion[] = [
      ...builtinDefs
        .filter((s) => s.label.startsWith(q))
        .map((s) => ({
          label: s.label,
          detail: s.detail,
          type: "snippet" as const,
          boost: -1,
          apply: snippet(s.template),
        })),
      ...userDefs
        .filter((s) => s.prefix.toLowerCase().startsWith(q))
        .map((s) => ({
          label: s.prefix,
          detail: s.description,
          type: "snippet" as const,
          boost: -2,
          apply: snippet(s.body),
        })),
    ];
    if (options.length === 0) return null;
    return { from: word.from, options };
  };
}

/** Build base extensions from current settings using compartments. */
function buildBaseExtensions(): Extension[] {
  const s = getSettings();
  return [
    lineNumbersCompartment.of(s.lineNumbers ? lineNumbers() : []),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      // VS Code parity keybindings
      { key: "Mod-/", run: toggleComment },
      { key: "Alt-ArrowUp", run: moveLineUp },
      { key: "Alt-ArrowDown", run: moveLineDown },
      { key: "Shift-Alt-ArrowUp", run: copyLineUp },
      { key: "Shift-Alt-ArrowDown", run: copyLineDown },
      { key: "Mod-d", run: selectNextOccurrence },
      { key: "Shift-Alt-f", run: (view) => { selectAll(view); indentSelection(view); return true; } },
      // Standard CodeMirror keymaps
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    oneDark,
    codexTheme,
    fontSizeCompartment.of(buildFontSizeTheme(s.fontSize)),
    tabSizeCompartment.of(EditorState.tabSize.of(s.tabSize)),
    indentGuideTheme,
    hoverTooltipExt,
    hoverTooltipTheme,
    bracketColorCompartment.of(s.bracketColorization ? bracketColorization : []),
    minimapCompartment.of(s.minimap ? minimapPlugin : []),
    stickyScrollCompartment.of(s.stickyScroll ? stickyScrollPlugin : []),
    lineWrapCompartment.of(s.wordWrap ? EditorView.lineWrapping : []),
  ];
}

/** Select language extension based on file extension. */
function getLanguageExtension(filePath: string): Extension {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": return javascript({ jsx: true, typescript: true });
    case "js": case "jsx": case "mjs": case "cjs": return javascript({ jsx: true });
    case "json": return json();
    case "css": case "scss": case "less": return css();
    case "html": case "htm": case "svg": return html();
    case "md": case "mdx": return markdown();
    case "py": return python();
    case "rs": return rust();
    case "c": case "h": case "cpp": case "hpp": case "cc": return cpp();
    default: return javascript({ jsx: true, typescript: true });
  }
}

function createEditorState(content: string, filePath?: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      ...buildBaseExtensions(),
      getLanguageExtension(filePath ?? ""),
      autocompletion({ override: [snippetCompletion(filePath ?? "")] }),
    ],
  });
}

export function EditorArea(props: Props) {
  let editorContainer: HTMLDivElement | undefined;
  let editorView: EditorView | undefined;
  let splitContainer: HTMLDivElement | undefined;
  let splitView: EditorView | undefined;
  const [splitFile, setSplitFile] = createSignal<string | null>(null);
  const [splitDirection, setSplitDirection] = createSignal<"horizontal" | "vertical" | null>(null);
  const [tabContextMenu, setTabContextMenu] = createSignal<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [modifiedFiles, setModifiedFiles] = createSignal<Set<string>>(new Set());
  const [pinnedTabs, setPinnedTabs] = createSignal<Set<string>>(new Set());
  const [previewTab, setPreviewTab] = createSignal<string | null>(null);
  const [isSaving, setIsSaving] = createSignal(false);
  const [searchEditorData, setSearchEditorData] = createSignal<{ query: string; results: { file: string; line: number; col: number; text: string }[] } | null>(null);
  const [dragOverTab, setDragOverTab] = createSignal<string | null>(null);
  const [findOpen, setFindOpen] = createSignal(false);
  const [cursorLine, setCursorLine] = createSignal(1);
  const [breadcrumbSymbols, setBreadcrumbSymbols] = createSignal<{ name: string; kind: string; line: number; siblings: { name: string; kind: string; line: number }[] }[]>([]);
  const [breadcrumbDropdown, setBreadcrumbDropdown] = createSignal<{ index: number; type: "path" | "symbol"; x: number; y: number } | null>(null);
  let symbolCache: { name: string; kind: string; line: number; endLine: number; children?: any[] }[] = [];
  let symbolFetchTimer: ReturnType<typeof setTimeout> | undefined;
  let draggedTab: string | null = null;

  /** Fetch document symbols from LSP for the active file and cache them. */
  const fetchDocumentSymbols = (filePath: string) => {
    if (symbolFetchTimer) clearTimeout(symbolFetchTimer);
    symbolFetchTimer = setTimeout(async () => {
      const client = getLspClient();
      if (!client.supportsLanguage(filePath)) {
        symbolCache = [];
        return;
      }
      try {
        const syms = await client.documentSymbols(filePath);
        const flatten = (items: any[]): typeof symbolCache => items.map(s => ({
          name: s.name,
          kind: lspSymbolKindLabel(s.kind),
          line: (s.selectionRange?.start?.line ?? s.range?.start?.line ?? 0) + 1,
          endLine: (s.range?.end?.line ?? s.selectionRange?.start?.line ?? 0) + 1,
          children: s.children?.length ? flatten(s.children) : undefined,
        }));
        symbolCache = flatten(syms);
        updateBreadcrumbSymbols(cursorLine());
      } catch {
        symbolCache = [];
      }
    }, 300);
  };

  /** Map LSP SymbolKind to a display label. */
  const lspSymbolKindLabel = (kind: number): string => {
    const map: Record<number, string> = { 1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class", 6: "method", 7: "property", 8: "field", 9: "constructor", 10: "enum", 11: "interface", 12: "function", 13: "variable", 14: "constant", 15: "string", 16: "number", 17: "boolean", 18: "array", 19: "object", 20: "key", 21: "null", 22: "enum member", 23: "struct", 24: "event", 25: "operator", 26: "type parameter" };
    return map[kind] ?? "symbol";
  };

  /** Walk the symbol tree to find the chain of symbols containing the cursor line. */
  const updateBreadcrumbSymbols = (line: number) => {
    const chain: { name: string; kind: string; line: number; siblings: { name: string; kind: string; line: number }[] }[] = [];
    const walk = (items: typeof symbolCache, depth: number) => {
      const match = items.find(s => line >= s.line && line <= s.endLine);
      if (match) {
        chain.push({
          name: match.name,
          kind: match.kind,
          line: match.line,
          siblings: items.map(s => ({ name: s.name, kind: s.kind, line: s.line })),
        });
        if (match.children?.length) walk(match.children, depth + 1);
      }
    };
    walk(symbolCache, 0);
    setBreadcrumbSymbols(chain);
  };

  /** Check if a file is an image/media file that should show preview instead of editor. */
  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"]);
  const isImageFile = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTS.has(ext);
  };

  // Cache editor states per file for persistence across tab switches
  const stateCache = new Map<string, EditorState>();
  // Track original content for modified detection
  const originalContent = new Map<string, string>();

  const handleTabContextMenu = (e: MouseEvent, file: string) => {
    e.preventDefault();
    e.stopPropagation();
    const fileIdx = props.openFiles.indexOf(file);
    const isPinned = pinnedTabs().has(file);
    const items: ContextMenuItem[] = [
      { id: "close", label: "Close", shortcut: "Ctrl+W", action: () => props.onCloseFile(file) },
      { id: "close-others", label: "Close Others", action: () => {
        props.openFiles.filter((f) => f !== file).forEach((f) => props.onCloseFile(f));
      }},
      { id: "close-right", label: "Close to the Right", action: () => {
        props.openFiles.slice(fileIdx + 1).forEach((f) => props.onCloseFile(f));
      }},
      { id: "close-all", label: "Close All", action: () => {
        [...props.openFiles].forEach((f) => props.onCloseFile(f));
      }},
      { id: "div1", label: "", divider: true, action: () => {} },
      { id: "pin", label: isPinned ? "Unpin Tab" : "Pin Tab", action: () => {
        setPinnedTabs((prev) => {
          const next = new Set(prev);
          if (isPinned) next.delete(file); else next.add(file);
          return next;
        });
      }},
      { id: "div2", label: "", divider: true, action: () => {} },
      { id: "copy-path", label: "Copy Path", shortcut: "Ctrl+Shift+C", action: () => navigator.clipboard.writeText(file) },
      { id: "copy-name", label: "Copy Name", action: () => {
        const name = file.split("/").pop() ?? file;
        navigator.clipboard.writeText(name);
      }},
    ];
    setTabContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const getFileContent = async (path: string): Promise<string> => {
    try {
      return await getFS().readFile(path);
    } catch {
      const ext = path.split(".").pop() ?? "";
      return `// ${path}\n// File not found in filesystem\n// Language: ${ext}\n`;
    }
  };

  /** Check if current editor content differs from original and update modified set. */
  const checkModified = () => {
    const file = props.activeFile;
    if (!file || !editorView) return;
    const current = editorView.state.doc.toString();
    const original = originalContent.get(file) ?? "";
    setModifiedFiles((prev) => {
      const next = new Set(prev);
      if (current !== original) {
        next.add(file);
      } else {
        next.delete(file);
      }
      return next;
    });
  };

  /** Create editor state with change listener for modified tracking + LSP integration. */
  const createTrackedState = (content: string, filePath: string): EditorState => {
    if (!originalContent.has(filePath)) {
      originalContent.set(filePath, content);
    }

    // Build completion sources — snippets + LSP (if available)
    const completionSources: Array<(ctx: CompletionContext) => any> = [snippetCompletion(filePath)];
    const lspClient = getLspClient();
    if (lspClient.supportsLanguage(filePath)) {
      completionSources.push(lspCompletionExtension(filePath));
    }

    // Notify LSP server of document open
    lspClient.didOpen(filePath, content);

    return EditorState.create({
      doc: content,
      extensions: [
        ...buildBaseExtensions(),
        getLanguageExtension(filePath),
        autocompletion({ override: completionSources }),
        ...lspExtensions(filePath),
        ...debugExtensions(filePath),
        ...blameExtensions(filePath),
        ...mergeConflictExtensions(),
        ...gitGutterExtensions(),
        ...codeLensExtensions(),
        ...linkedEditingExtensions(),
        ...codeActionsExtensions(),
        ...indentGuidesExtensions(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            checkModified();
            document.dispatchEvent(new CustomEvent("codex:doc-changed"));
            // Promote preview tab to permanent on edit
            if (props.activeFile && previewTab() === props.activeFile) {
              setPreviewTab(null);
            }
            // Update git gutter markers
            const orig = originalContent.get(props.activeFile ?? "");
            if (orig != null) {
              const changes = computeGitChanges(orig, update.state.doc.toString());
              update.view.dispatch({ effects: setGitChanges.of(changes) });
            }
          }
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            const selected = Math.abs(update.state.selection.main.to - update.state.selection.main.from);
            setCursorLine(line.number);
            updateBreadcrumbSymbols(line.number);
            document.dispatchEvent(new CustomEvent("codex:cursor-update", {
              detail: { line: line.number, col: pos - line.from + 1, selected },
            }));
            document.dispatchEvent(new CustomEvent("codex:editor-info", {
              detail: { maxLine: update.state.doc.lines },
            }));
          }
        }),
      ],
    });
  };

  /** Save the active file — writes content back to filesystem and clears modified flag. */
  const saveActiveFile = async () => {
    const file = props.activeFile;
    if (!file || !editorView) return;
    // Format on save — request LSP formatting or apply indentation
    const s = getSettings();
    if (s.formatOnSave) {
      try {
        const formatted = await getLspClient().format(file);
        if (formatted) {
          editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: formatted },
          });
        }
      } catch {}
    }
    const content = editorView.state.doc.toString();
    setIsSaving(true);
    try {
      await getFS().writeFile(file, content);
      originalContent.set(file, content);
      setModifiedFiles((prev) => {
        const next = new Set(prev);
        next.delete(file);
        return next;
      });
      notify(`Saved ${file.split("/").pop()}`, "success", 2000);
      // Notify LSP server of save
      getLspClient().didSave(file);
      // Timeline event
      document.dispatchEvent(new CustomEvent("codex:file-saved", { detail: { path: file, type: "save" } }));
    } catch (err) {
      notify(`Failed to save ${file.split("/").pop()}`, "error", 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Listen for save events
  const handleSave = () => saveActiveFile();
  document.addEventListener("codex:save-file", handleSave);
  onCleanup(() => document.removeEventListener("codex:save-file", handleSave));

  // Settings change listener — dynamically reconfigure editor via compartments
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const handleSettingsChanged = ((e: CustomEvent<{ key: string; value: any; settings: EditorSettings }>) => {
    if (!editorView) return;
    const s = e.detail.settings;
    const effects: any[] = [];
    const key = e.detail.key;
    if (key === "fontSize" || key === "batch" || key === "reset") {
      effects.push(fontSizeCompartment.reconfigure(buildFontSizeTheme(s.fontSize)));
    }
    if (key === "tabSize" || key === "batch" || key === "reset") {
      effects.push(tabSizeCompartment.reconfigure(EditorState.tabSize.of(s.tabSize)));
    }
    if (key === "wordWrap" || key === "batch" || key === "reset") {
      effects.push(lineWrapCompartment.reconfigure(s.wordWrap ? EditorView.lineWrapping : []));
    }
    if (key === "lineNumbers" || key === "batch" || key === "reset") {
      effects.push(lineNumbersCompartment.reconfigure(s.lineNumbers ? lineNumbers() : []));
    }
    if (key === "minimap" || key === "batch" || key === "reset") {
      effects.push(minimapCompartment.reconfigure(s.minimap ? minimapPlugin : []));
    }
    if (key === "bracketColorization" || key === "batch" || key === "reset") {
      effects.push(bracketColorCompartment.reconfigure(s.bracketColorization ? bracketColorization : []));
    }
    if (key === "stickyScroll" || key === "batch" || key === "reset") {
      effects.push(stickyScrollCompartment.reconfigure(s.stickyScroll ? stickyScrollPlugin : []));
    }
    if (effects.length > 0) {
      editorView.dispatch({ effects });
    }
  }) as EventListener;
  document.addEventListener("codex:settings-changed", handleSettingsChanged);
  onCleanup(() => document.removeEventListener("codex:settings-changed", handleSettingsChanged));

  // Auto-save: trigger save after delay when content changes
  const scheduleAutoSave = () => {
    const s = getSettings();
    if (!s.autoSave) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveActiveFile(), s.autoSaveDelay);
  };
  // Patch into updateListener via custom event
  document.addEventListener("codex:doc-changed", scheduleAutoSave);
  onCleanup(() => {
    document.removeEventListener("codex:doc-changed", scheduleAutoSave);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
  });

  // Preview tab — single-click file from sidebar opens in preview mode
  const handlePreviewOpen = ((e: CustomEvent<{ path: string }>) => {
    const p = e.detail?.path;
    if (p) {
      // Close existing preview tab if different
      const current = previewTab();
      if (current && current !== p) {
        props.onCloseFile(current);
      }
      setPreviewTab(p);
    }
  }) as EventListener;
  document.addEventListener("codex:open-file-preview", handlePreviewOpen);
  onCleanup(() => document.removeEventListener("codex:open-file-preview", handlePreviewOpen));

  // Search Editor — open search results as a tab
  const handleOpenSearchEditor = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.query && detail?.results) {
      setSearchEditorData({ query: detail.query, results: detail.results });
      props.onOpenFile?.("search-editor://results");
    }
  };
  document.addEventListener("codex:open-search-editor", handleOpenSearchEditor);
  onCleanup(() => document.removeEventListener("codex:open-search-editor", handleOpenSearchEditor));

  // Ctrl+F / Ctrl+H — Find / Replace
  const handleFindKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && (e.key === "f" || e.key === "h") && props.activeFile) {
      e.preventDefault();
      e.stopPropagation();
      setFindOpen(true);
    }
  };
  document.addEventListener("keydown", handleFindKey);
  onCleanup(() => document.removeEventListener("keydown", handleFindKey));

  // Find/replace events from FindReplace component
  const handleFind = ((e: CustomEvent<{ query: string; caseSensitive: boolean; wholeWord: boolean; useRegex: boolean }>) => {
    if (!editorView) return;
    const { query, caseSensitive: cs } = e.detail;
    if (!query) return;
    // Count matches for the UI
    const doc = editorView.state.doc.toString();
    const flags = cs ? "g" : "gi";
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, flags);
      let count = 0;
      while (regex.exec(doc) !== null) {
        count++;
        if (count > 10000) break;
      }
      document.dispatchEvent(new CustomEvent("codex:match-count", {
        detail: { count, current: count > 0 ? 1 : 0 },
      }));
    } catch {
      // Invalid regex
    }
    // Set CM6 search query for highlighting and navigation
    const sq = new SearchQuery({ search: query, caseSensitive: cs, regexp: e.detail.useRegex, wholeWord: e.detail.wholeWord });
    editorView.dispatch({ effects: setSearchQuery.of(sq) });
  }) as EventListener;
  document.addEventListener("codex:find", handleFind);
  onCleanup(() => document.removeEventListener("codex:find", handleFind));

  const handleFindNextEvt = (() => {
    if (!editorView) return;
    cmFindNext(editorView);
  }) as EventListener;
  document.addEventListener("codex:find-next", handleFindNextEvt);
  onCleanup(() => document.removeEventListener("codex:find-next", handleFindNextEvt));

  const handleFindPrevEvt = (() => {
    if (!editorView) return;
    cmFindPrev(editorView);
  }) as EventListener;
  document.addEventListener("codex:find-prev", handleFindPrevEvt);
  onCleanup(() => document.removeEventListener("codex:find-prev", handleFindPrevEvt));

  const handleFindClear = (() => {
    if (!editorView) return;
    // Clear search by setting empty query
    const sq = new SearchQuery({ search: "" });
    editorView.dispatch({ effects: setSearchQuery.of(sq) });
  }) as EventListener;
  document.addEventListener("codex:find-clear", handleFindClear);
  onCleanup(() => document.removeEventListener("codex:find-clear", handleFindClear));

  // Preserve case helper: match the case pattern of the original text onto the replacement
  const applyCasePattern = (original: string, replacement: string): string => {
    if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
    if (original === original.toLowerCase() && original !== original.toUpperCase()) return replacement.toLowerCase();
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
  };

  const handleReplaceOne = ((e: CustomEvent<{ replaceWith: string; preserveCase?: boolean }>) => {
    if (!editorView) return;
    const replaceWith = e.detail.replaceWith;
    const preserve = e.detail.preserveCase ?? false;
    // Update the SearchQuery with replace text so CM6 knows what to replace with
    const cur = getSearchQuery(editorView.state);
    const sq = new SearchQuery({ search: cur.search, replace: replaceWith, caseSensitive: cur.caseSensitive, regexp: cur.regexp, wholeWord: cur.wholeWord });
    editorView.dispatch({ effects: setSearchQuery.of(sq) });

    if (preserve && editorView.state.selection.main.from !== editorView.state.selection.main.to) {
      // Manual preserve-case replace: get selected match text, apply case pattern, replace directly
      const sel = editorView.state.selection.main;
      const matchText = editorView.state.sliceDoc(sel.from, sel.to);
      const cased = applyCasePattern(matchText, replaceWith);
      editorView.dispatch({ changes: { from: sel.from, to: sel.to, insert: cased } });
      cmFindNext(editorView);
    } else {
      cmReplaceNext(editorView);
    }
  }) as EventListener;
  document.addEventListener("codex:replace-one", handleReplaceOne);
  onCleanup(() => document.removeEventListener("codex:replace-one", handleReplaceOne));

  const handleReplaceAllEvt = ((e: CustomEvent<{ replaceWith: string; preserveCase?: boolean }>) => {
    if (!editorView) return;
    const replaceWith = e.detail.replaceWith;
    const preserve = e.detail.preserveCase ?? false;
    const cur = getSearchQuery(editorView.state);
    const sq = new SearchQuery({ search: cur.search, replace: replaceWith, caseSensitive: cur.caseSensitive, regexp: cur.regexp, wholeWord: cur.wholeWord });
    editorView.dispatch({ effects: setSearchQuery.of(sq) });

    if (preserve) {
      // Manual preserve-case replace-all: find all matches, build changes array with case-adjusted replacements
      const doc = editorView.state.doc.toString();
      const flags = cur.caseSensitive ? "g" : "gi";
      try {
        const pattern = cur.regexp ? cur.search : cur.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(pattern, flags);
        const changes: { from: number; to: number; insert: string }[] = [];
        let match;
        while ((match = regex.exec(doc)) !== null) {
          changes.push({ from: match.index, to: match.index + match[0].length, insert: applyCasePattern(match[0], replaceWith) });
          if (changes.length > 10000) break;
        }
        if (changes.length > 0) {
          editorView.dispatch({ changes });
        }
      } catch { /* invalid regex */ }
    } else {
      cmReplaceAll(editorView);
    }
  }) as EventListener;
  document.addEventListener("codex:replace-all", handleReplaceAllEvt);
  onCleanup(() => document.removeEventListener("codex:replace-all", handleReplaceAllEvt));

  // Command palette dispatchers for editor commands
  const handleToggleComment = () => { if (editorView) toggleComment(editorView); };
  const handleMoveLineUp = () => { if (editorView) moveLineUp(editorView); };
  const handleMoveLineDown = () => { if (editorView) moveLineDown(editorView); };
  const handleCopyLineUp = () => { if (editorView) copyLineUp(editorView); };
  const handleCopyLineDown = () => { if (editorView) copyLineDown(editorView); };
  const handleSelectNext = () => { if (editorView) selectNextOccurrence(editorView); };
  const handleFormatDocument = () => { if (editorView) { selectAll(editorView); indentSelection(editorView); } };
  document.addEventListener("codex:toggle-comment", handleToggleComment);
  document.addEventListener("codex:move-line-up", handleMoveLineUp);
  document.addEventListener("codex:move-line-down", handleMoveLineDown);
  document.addEventListener("codex:copy-line-up", handleCopyLineUp);
  document.addEventListener("codex:copy-line-down", handleCopyLineDown);
  document.addEventListener("codex:select-next", handleSelectNext);
  document.addEventListener("codex:format-document", handleFormatDocument);
  onCleanup(() => {
    document.removeEventListener("codex:toggle-comment", handleToggleComment);
    document.removeEventListener("codex:move-line-up", handleMoveLineUp);
    document.removeEventListener("codex:move-line-down", handleMoveLineDown);
    document.removeEventListener("codex:copy-line-up", handleCopyLineUp);
    document.removeEventListener("codex:copy-line-down", handleCopyLineDown);
    document.removeEventListener("codex:select-next", handleSelectNext);
    document.removeEventListener("codex:format-document", handleFormatDocument);
  });

  // Split editor — Ctrl+\
  const handleSplitEditor = () => {
    if (!props.activeFile) return;
    if (splitDirection()) {
      // Close split
      if (splitView) { splitView.destroy(); splitView = undefined; }
      setSplitFile(null);
      setSplitDirection(null);
    } else {
      // Open split with current file
      setSplitFile(props.activeFile);
      setSplitDirection("horizontal");
      // Create split editor view after DOM update
      requestAnimationFrame(async () => {
        if (!splitContainer || !splitFile()) return;
        const content = await getFileContent(splitFile()!);
        const state = createTrackedState(content, splitFile()!);
        splitView = new EditorView({ state, parent: splitContainer });
      });
    }
  };
  const handleSplitKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "\\") { e.preventDefault(); handleSplitEditor(); }
  };
  document.addEventListener("keydown", handleSplitKey);
  document.addEventListener("codex:split-editor", handleSplitEditor);
  onCleanup(() => {
    document.removeEventListener("keydown", handleSplitKey);
    document.removeEventListener("codex:split-editor", handleSplitEditor);
    if (splitView) { splitView.destroy(); splitView = undefined; }
  });

  // Listen for symbol extraction requests (Ctrl+Shift+O)
  const handleSymbolRequest = () => {
    if (!editorView) return;
    const content = editorView.state.doc.toString();
    const lines = content.split("\n");
    const symbols: { name: string; kind: string; line: number; icon: string; color: string }[] = [];
    const patterns: { regex: RegExp; kind: string }[] = [
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
          symbols.push({ name: match[1], kind, line: i + 1, icon: "", color: "" });
          break;
        }
      }
    }
    document.dispatchEvent(new CustomEvent("codex:symbols-response", { detail: { symbols } }));
  };
  document.addEventListener("codex:request-symbols", handleSymbolRequest);
  onCleanup(() => document.removeEventListener("codex:request-symbols", handleSymbolRequest));

  // Listen for goto-line events
  const handleGotoLine = ((e: CustomEvent<{ line: number }>) => {
    if (!editorView) return;
    const line = Math.max(1, Math.min(e.detail.line, editorView.state.doc.lines));
    const lineInfo = editorView.state.doc.line(line);
    editorView.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    });
    editorView.focus();
  }) as EventListener;
  document.addEventListener("codex:goto-line", handleGotoLine);
  onCleanup(() => document.removeEventListener("codex:goto-line", handleGotoLine));

  const getOrCreateState = async (path: string): Promise<EditorState> => {
    const cached = stateCache.get(path);
    if (cached) return cached;
    const content = await getFileContent(path);
    const state = createTrackedState(content, path);
    stateCache.set(path, state);
    return state;
  };

  onMount(async () => {
    if (editorContainer && props.activeFile) {
      const state = await getOrCreateState(props.activeFile);
      editorView = new EditorView({
        state,
        parent: editorContainer,
      });
    }
  });

  createEffect(() => {
    const file = props.activeFile;
    if (!file) {
      // No file open — destroy editor, WelcomeTab handles display
      editorView?.destroy();
      editorView = undefined;
      return;
    }

    // Async file loading — track the current request to avoid race conditions
    const loadFile = async () => {
      if (!editorView && editorContainer) {
        const state = await getOrCreateState(file);
        editorView = new EditorView({
          state,
          parent: editorContainer,
        });
        previousFile = file;
        return;
      }

      if (!editorView) return;

      // Save current state before switching
      const currentDoc = editorView.state;
      const prevFile = findPreviousFile(file);
      if (prevFile && currentDoc) {
        stateCache.set(prevFile, currentDoc);
      }
      // Load the target file state
      const state = await getOrCreateState(file);
      editorView.setState(state);
    };

    loadFile();
    // Fetch symbols for breadcrumb navigation
    fetchDocumentSymbols(file);
  });

  // Track the previously active file for state caching
  let previousFile: string | null = null;
  function findPreviousFile(newFile: string): string | null {
    const prev = previousFile;
    previousFile = newFile;
    return prev;
  }

  // Listen for file close events — notify LSP of document close
  const handleFileClose = ((e: CustomEvent<{ path: string }>) => {
    getLspClient().didClose(e.detail.path);
    stateCache.delete(e.detail.path);
    originalContent.delete(e.detail.path);
  }) as EventListener;
  document.addEventListener("codex:file-closed", handleFileClose);
  onCleanup(() => document.removeEventListener("codex:file-closed", handleFileClose));

  onCleanup(() => {
    editorView?.destroy();
  });

  /** Render inline SVG for a file's icon. */
  const fileIconSVG = (filePath: string) => {
    const icon = getFileIcon(filePath);
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="${icon.color}" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}"/></svg>`;
  };

  return (
    <div class="editor-area">
      <ProgressBar active={isSaving()} />
      {/* Tab Bar */}
      <div class="editor-tabs">
        <Show when={props.openFiles.length === 0}>
          <div class="tab active">
            <span class="tab-icon" innerHTML={`<svg width="14" height="14" viewBox="0 0 16 16" fill="var(--accent-blue)" xmlns="http://www.w3.org/2000/svg"><path d="${getFileIcon("Welcome").path}"/></svg>`} />
            <span class="tab-name">Welcome</span>
          </div>
        </Show>
        <For each={[...props.openFiles].sort((a, b) => {
          const ap = pinnedTabs().has(a) ? 0 : 1;
          const bp = pinnedTabs().has(b) ? 0 : 1;
          return ap - bp;
        })}>
          {(file) => {
            const name = file.split("/").pop() ?? file;
            const isPinned = () => pinnedTabs().has(file);
            const isPreview = () => previewTab() === file;
            return (
              <div
                class={`tab ${props.activeFile === file ? "active" : ""} ${dragOverTab() === file ? "drag-over" : ""} ${isPinned() ? "pinned" : ""} ${isPreview() ? "preview" : ""}`}
                draggable={true}
                onClick={() => { props.onSelectFile(file); if (isPreview()) setPreviewTab(null); }}
                onAuxClick={(e: MouseEvent) => { if (e.button === 1) { e.preventDefault(); props.onCloseFile(file); } }}
                onContextMenu={(e: MouseEvent) => handleTabContextMenu(e, file)}
                onDragStart={(e) => {
                  draggedTab = file;
                  e.dataTransfer!.effectAllowed = "move";
                  e.dataTransfer!.setData("text/plain", file);
                  (e.currentTarget as HTMLElement).classList.add("dragging");
                }}
                onDragEnd={(e) => {
                  draggedTab = null;
                  setDragOverTab(null);
                  (e.currentTarget as HTMLElement).classList.remove("dragging");
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer!.dropEffect = "move";
                  if (draggedTab && draggedTab !== file) {
                    setDragOverTab(file);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverTab() === file) setDragOverTab(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTab(null);
                  if (!draggedTab || draggedTab === file) return;
                  const files = [...props.openFiles];
                  const fromIdx = files.indexOf(draggedTab);
                  const toIdx = files.indexOf(file);
                  if (fromIdx < 0 || toIdx < 0) return;
                  files.splice(fromIdx, 1);
                  files.splice(toIdx, 0, draggedTab);
                  props.onReorderFiles?.(files);
                  draggedTab = null;
                }}
              >
                <span class="tab-icon" innerHTML={fileIconSVG(file)} />
                <Show when={!isPinned()} fallback={null}>
                  <span class={`tab-name truncate ${isPreview() ? "tab-preview-name" : ""}`} style={{ color: getGitStatusColor(getFileGitStatus(file)) ?? undefined }}>
                    {name}
                    <Show when={modifiedFiles().has(file)}>
                      <span class="tab-modified" />
                    </Show>
                  </span>
                </Show>
                <Show when={!isPinned()}>
                  <button
                    class="tab-close"
                    onClick={(e) => { e.stopPropagation(); props.onCloseFile(file); }}
                  >
                    &times;
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Breadcrumb with symbol picker */}
      <Show when={props.activeFile}>
        {(file) => {
          const parts = () => file().split("/");
          const goToLine = (line: number) => {
            if (!editorView) return;
            const lineInfo = editorView.state.doc.line(Math.min(line, editorView.state.doc.lines));
            editorView.dispatch({ selection: { anchor: lineInfo.from }, effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }) });
            editorView.focus();
            setBreadcrumbDropdown(null);
          };
          const openDropdown = (e: MouseEvent, index: number, type: "path" | "symbol") => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const dd = breadcrumbDropdown();
            if (dd && dd.index === index && dd.type === type) { setBreadcrumbDropdown(null); return; }
            setBreadcrumbDropdown({ index, type, x: rect.left, y: rect.bottom + 2 });
          };
          return (
            <div class="editor-breadcrumb" onClick={() => setBreadcrumbDropdown(null)}>
              <For each={parts()}>
                {(part, i) => (
                  <>
                    <Show when={i() > 0}>
                      <span class="breadcrumb-sep">{"\u203A"}</span>
                    </Show>
                    <span
                      class={`breadcrumb-part ${i() === parts().length - 1 && breadcrumbSymbols().length === 0 ? "active" : ""}`}
                      onClick={(e) => openDropdown(e, i(), "path")}
                    >
                      {part}
                    </span>
                  </>
                )}
              </For>
              <For each={breadcrumbSymbols()}>
                {(sym, i) => (
                  <>
                    <span class="breadcrumb-sep">{"\u203A"}</span>
                    <span
                      class={`breadcrumb-part breadcrumb-symbol ${i() === breadcrumbSymbols().length - 1 ? "active" : ""}`}
                      onClick={(e) => openDropdown(e, i(), "symbol")}
                    >
                      <span class={`breadcrumb-kind-icon breadcrumb-kind-${sym.kind}`}>{sym.kind === "function" ? "f" : sym.kind === "class" ? "C" : sym.kind === "interface" ? "I" : sym.kind === "method" ? "m" : sym.kind === "variable" ? "v" : sym.kind === "enum" ? "E" : sym.kind === "type parameter" ? "T" : "s"}</span>
                      {sym.name}
                    </span>
                  </>
                )}
              </For>
              {/* Dropdown picker */}
              <Show when={breadcrumbDropdown()}>
                {(dd) => (
                  <div class="breadcrumb-dropdown" style={{ left: `${dd().x}px`, top: `${dd().y}px` }} onClick={(e) => e.stopPropagation()}>
                    <Show when={dd().type === "path"}>
                      <For each={props.openFiles.map(f => f.split("/").pop() ?? f)}>
                        {(name, fi) => (
                          <div
                            class={`breadcrumb-dropdown-item ${props.openFiles[fi()] === file() ? "active" : ""}`}
                            onClick={() => { props.onSelectFile(props.openFiles[fi()]); setBreadcrumbDropdown(null); }}
                          >
                            <span class="breadcrumb-dropdown-icon" style={{ color: getFileIcon(props.openFiles[fi()]).color }}>{getFileIcon(props.openFiles[fi()]).label ?? "\u25CB"}</span>
                            {name}
                          </div>
                        )}
                      </For>
                    </Show>
                    <Show when={dd().type === "symbol"}>
                      {(() => {
                        const sym = breadcrumbSymbols()[dd().index];
                        const siblings = sym?.siblings ?? [];
                        return (
                          <For each={siblings}>
                            {(s) => (
                              <div
                                class={`breadcrumb-dropdown-item ${s.name === sym?.name ? "active" : ""}`}
                                onClick={() => goToLine(s.line)}
                              >
                                <span class={`breadcrumb-kind-icon breadcrumb-kind-${s.kind}`}>{s.kind === "function" ? "f" : s.kind === "class" ? "C" : s.kind === "interface" ? "I" : s.kind === "method" ? "m" : s.kind === "variable" ? "v" : s.kind === "enum" ? "E" : "s"}</span>
                                {s.name}
                              </div>
                            )}
                          </For>
                        );
                      })()}
                    </Show>
                  </div>
                )}
              </Show>
            </div>
          );
        }}
      </Show>

      {/* Welcome Tab (no files open) */}
      <Show when={!props.activeFile}>
        <WelcomeTab onOpenFile={props.onOpenFile} />
      </Show>

      {/* Search Editor */}
      <Show when={props.activeFile === "search-editor://results" && searchEditorData()}>
        <SearchEditor
          query={searchEditorData()!.query}
          results={searchEditorData()!.results}
          onOpenFile={(path, line) => {
            props.onOpenFile?.(path);
          }}
        />
      </Show>

      {/* Editor or Preview */}
      <Show when={props.activeFile && props.activeFile !== "search-editor://results"}>
        <div class={`editor-split-wrapper ${splitDirection() === "horizontal" ? "split-h" : splitDirection() === "vertical" ? "split-v" : ""}`}>
          <Show when={isImageFile(props.activeFile!)} fallback={
            <div class="editor-content" ref={editorContainer} />
          }>
            <div class="image-preview">
              <div class="image-preview-info">
                <span class="image-preview-name">{props.activeFile!.split("/").pop()}</span>
              </div>
              <div class="image-preview-container">
                <img
                  src={`file://${props.activeFile}`}
                  alt={props.activeFile!.split("/").pop()}
                  class="image-preview-img"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="image-preview-error">Unable to load image preview.<br/>Image files require TerraRuntime (desktop mode).</div>`;
                  }}
                />
              </div>
            </div>
          </Show>

          {/* Split Editor Pane */}
          <Show when={splitDirection()}>
            <div class="split-divider" />
            <div class="split-pane">
              <div class="split-pane-header">
                <span class="split-pane-title">{splitFile()?.split("/").pop() ?? ""}</span>
                <button class="split-pane-close" onClick={() => {
                  if (splitView) { splitView.destroy(); splitView = undefined; }
                  setSplitFile(null);
                  setSplitDirection(null);
                }}>&times;</button>
              </div>
              <div class="editor-content" ref={splitContainer} />
            </div>
          </Show>
        </div>
      </Show>

      <Show when={findOpen() && props.activeFile}>
        <FindReplace onClose={() => setFindOpen(false)} />
      </Show>

      <Show when={tabContextMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            items={menu().items}
            onClose={() => setTabContextMenu(null)}
          />
        )}
      </Show>

      <style>{`
        .editor-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          background: var(--bg-surface);
          position: relative;
        }
        .editor-tabs {
          height: var(--tab-height);
          display: flex;
          align-items: stretch;
          background: var(--bg-base);
          border-bottom: 1px solid var(--border-subtle);
          overflow-x: auto;
          overflow-y: hidden;
          flex-shrink: 0;
        }
        .editor-tabs::-webkit-scrollbar {
          height: 0;
        }
        .tab {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 0 var(--space-3);
          min-width: 100px;
          max-width: 180px;
          font-size: var(--text-sm);
          color: var(--text-tertiary);
          background: var(--bg-base);
          border-right: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          user-select: none;
        }
        .tab:hover {
          color: var(--text-secondary);
          background: var(--bg-surface);
        }
        .tab.active {
          color: var(--text-primary);
          background: var(--bg-surface);
          border-bottom: 2px solid var(--accent-blue);
        }
        .tab-icon {
          font-size: 10px;
          flex-shrink: 0;
        }
        .tab-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tab-modified {
          display: inline-block;
          width: 8px;
          height: 8px;
          background: var(--text-primary);
          border-radius: 50%;
          margin-left: 6px;
          vertical-align: middle;
          flex-shrink: 0;
        }
        .tab-close {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-disabled);
          cursor: pointer;
          font-size: 14px;
          opacity: 0;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }
        .tab:hover .tab-close {
          opacity: 1;
        }
        .tab-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .tab.dragging {
          opacity: 0.4;
        }
        .tab.drag-over {
          border-left: 2px solid var(--accent-blue);
        }
        .tab.pinned {
          max-width: 36px;
          min-width: 36px;
          padding: 0;
          justify-content: center;
          border-right: 1px solid var(--border-subtle);
        }
        .tab.pinned .tab-icon { margin: 0; }
        .tab.preview .tab-name, .tab-preview-name {
          font-style: italic;
        }
        .editor-breadcrumb {
          height: 24px;
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 0 var(--space-3);
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          font-size: var(--text-xs);
          flex-shrink: 0;
          overflow: hidden;
        }
        .breadcrumb-part {
          color: var(--text-disabled);
          cursor: pointer;
          padding: 1px 4px;
          border-radius: var(--radius-sm);
          transition: color var(--duration-fast) var(--ease-out);
          white-space: nowrap;
        }
        .breadcrumb-part:hover {
          color: var(--text-secondary);
          background: var(--bg-hover);
        }
        .breadcrumb-part.active {
          color: var(--text-primary);
        }
        .breadcrumb-sep {
          color: var(--text-disabled);
          font-size: 11px;
          user-select: none;
        }
        .breadcrumb-symbol {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .breadcrumb-kind-icon {
          font-size: 9px;
          font-weight: 700;
          font-family: var(--font-mono);
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .breadcrumb-kind-function, .breadcrumb-kind-method { color: var(--accent-purple, #bf5af2); }
        .breadcrumb-kind-class, .breadcrumb-kind-struct { color: var(--accent-orange, #ff9f0a); }
        .breadcrumb-kind-interface { color: var(--accent-teal, #64d2ff); }
        .breadcrumb-kind-variable, .breadcrumb-kind-constant { color: var(--text-secondary); }
        .breadcrumb-kind-enum { color: var(--accent-orange, #ff9f0a); }
        .breadcrumb-dropdown {
          position: fixed;
          z-index: 100;
          background: var(--bg-elevated, #1a1a1a);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md, 6px);
          box-shadow: var(--shadow-elevated, 0 8px 32px rgba(0,0,0,0.5));
          min-width: 180px;
          max-width: 320px;
          max-height: 300px;
          overflow-y: auto;
          padding: 4px 0;
        }
        .breadcrumb-dropdown-item {
          height: 26px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 10px;
          font-size: var(--text-xs, 12px);
          color: var(--text-secondary);
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .breadcrumb-dropdown-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .breadcrumb-dropdown-item.active {
          background: var(--accent-blue, #2997ff);
          color: white;
        }
        .breadcrumb-dropdown-icon {
          font-size: 10px;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
        }
        .editor-split-wrapper {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .editor-split-wrapper.split-h {
          flex-direction: row;
        }
        .editor-split-wrapper.split-v {
          flex-direction: column;
        }
        .editor-content {
          flex: 1;
          overflow: hidden;
        }
        .editor-content .cm-editor {
          height: 100%;
        }
        .split-divider {
          flex-shrink: 0;
          background: var(--border-subtle);
        }
        .split-h > .split-divider { width: 1px; cursor: col-resize; }
        .split-v > .split-divider { height: 1px; cursor: row-resize; }
        .split-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .split-pane-header {
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-3);
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .split-pane-title {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .split-pane-close {
          width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; border-radius: var(--radius-sm);
          color: var(--text-tertiary); cursor: pointer; font-size: 14px;
        }
        .split-pane-close:hover { background: var(--bg-hover); color: var(--text-primary); }

        /* Image Preview */
        .image-preview {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--bg-base);
          overflow: hidden;
        }
        .image-preview-info {
          height: 28px;
          display: flex;
          align-items: center;
          padding: 0 var(--space-3);
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }
        .image-preview-name {
          font-family: var(--font-mono);
        }
        .image-preview-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          overflow: auto;
        }
        .image-preview-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-elevated);
          background: repeating-conic-gradient(#1a1a1a 0% 25%, #0a0a0a 0% 50%) 0 0 / 16px 16px;
        }
        .image-preview-error {
          color: var(--text-disabled);
          font-size: var(--text-sm);
          text-align: center;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
