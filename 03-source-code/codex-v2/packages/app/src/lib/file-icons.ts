// ============================================================================
// CodeEX v2 — File Type Icons & Colors
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// SVG path data and colors for file type icons across the IDE.
// Used in: file tree, tabs, breadcrumbs, search results
// ============================================================================

export interface FileIconDef {
  /** SVG path data (for a 16x16 viewBox) */
  path: string;
  /** Icon fill color */
  color: string;
  /** Optional label */
  label?: string;
}

// ---------------------------------------------------------------------------
// SVG Path Data (simplified 16x16 paths) — MUST be declared first
// ---------------------------------------------------------------------------

const P_FILE = "M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707A1 1 0 0 0 13.707 4L10 .293A1 1 0 0 0 9.293 0H4zm5 1.5v2a1.5 1.5 0 0 0 1.5 1.5h2L9 1.5z";
const P_TS = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4.5 5V6h7v1H9v5.5H7.5V7h-3z";
const P_TSX = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4 5V6h5v1H7.5v5.5H6V7H4zm7.5-1v1.2l1.5 1.3-1.5 1.3V11L14 9.5 11.5 6z";
const P_JS = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm6 6.5v3c0 .83-.67 1.5-1.5 1.5S3 12.33 3 11.5h1.5V8.5H6zm4-2.5c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2H9v1.5h1.5V14H9c-1.1 0-2-.9-2-2v-1c0-1.1.9-2 2-2h1V7.5H8.5V6H10z";
const P_JSX = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm6 6.5v3c0 .83-.67 1.5-1.5 1.5S3 12.33 3 11.5h1.5V8.5H6zm5.5-2.5v1.2l1.5 1.3-1.5 1.3V11L14 9.5 11.5 6z";
const P_HTML = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4.5 3L2 8l2.5 3 1-1L3.5 8l2-2-1-1zm7 0l-1 1 2 2-2 2 1 1L14 8l-2.5-3zM7 12l2-8h-1l-2 8h1z";
const P_CSS = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4 4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v1H3v1.5h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4V6h2V4.5H4zm6 0a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v1H9v1.5h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V6h2V4.5h-2z";
const P_JSON = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4 3v1.5c0 .83-.67 1.5-1.5 1.5v1c.83 0 1.5.67 1.5 1.5V12h1.5v-1.5A2.5 2.5 0 0 0 3.5 8 2.5 2.5 0 0 0 5.5 5.5V4H4zm8 1.5V4h-1.5v1.5A2.5 2.5 0 0 0 12.5 8a2.5 2.5 0 0 0-2 2.5V12H12v-1.5c0-.83.67-1.5 1.5-1.5v-1c-.83 0-1.5-.67-1.5-1.5z";
const P_MD = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm2.5 3v6h1.5V8l1.5 2 1.5-2v3H8.5V5H7L5.5 7.5 4 5H2.5zm9.5 3l-2-3h1.5v6H13V8h1.5L12 5z";
const P_PY = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm7.5 1A.5.5 0 1 0 7.5 4a.5.5 0 0 0 0-1zM5 5a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1.5v1H5v1h2.5a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H6V6h4v1h1V6a1 1 0 0 0-1-1H5zm3.5 7a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z";
const P_RUST = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 4v6h1.5V9.5h1.25L7 12h1.8L7.3 9.2c.7-.3 1.2-1 1.2-1.7V7c0-1.1-.9-2-2-2H3zm1.5 1.5V6.5h1c.28 0 .5.22.5.5v.5c0 .28-.22.5-.5.5h-1z";
const P_C = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm5 3a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h2v-1.5H5a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 5 6.5h2V5H5z";
const P_CPP = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4 3a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h1v-1.5H4a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 4 6.5h1V5H4zm5 2.5V6h-1v1.5H6.5v1H8V10h1V8.5h1.5v-1H9zm3 0V6h-1v1.5h-1.5v1H11V10h1V8.5h1.5v-1H12z";
const P_GO = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm5 6a3 3 0 0 0 6 0V7a3 3 0 0 0-6 0v1zm1.5-1A1.5 1.5 0 0 1 8 5.5 1.5 1.5 0 0 1 9.5 7v1A1.5 1.5 0 0 1 8 9.5 1.5 1.5 0 0 1 6.5 8V7z";
const P_JAVA = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm7 3v4.5c0 .83-.67 1.5-1.5 1.5H5v1.5h.5c1.66 0 3-1.34 3-3V5H7z";
const P_RUBY = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 10l5-4-5-4v8zm6-4l4 4V4l-4 4z";
const P_SHELL = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 3l4 3-4 3V5zm5 6h5v1.5H8V11z";
const P_SVG = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 3l2.5 6H7L5.5 8 7 5H5.5L3 5zm5 0v6h1.5l2-3-2-3H8z";
const P_IMAGE = "M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm4.5 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5.5 5H4l3-4 1.5 2L11 6l3 5z";
const P_PDF = "M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707L9.293 0H4zm1 5h2c.55 0 1 .45 1 1v1c0 .55-.45 1-1 1H6v2H5V5zm4 0h2c.55 0 1 .45 1 1v4h-1V9h-1v2H9V5zm-3 1v1h1V6H6zm4 0v2h1V6h-1z";
const P_DOC = "M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707L9.293 0H4zm1 6h6v1H5V6zm0 2h6v1H5V8zm0 2h4v1H5v-1z";
const P_TABLE = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm1 2v3h5V4H1zm6 0v3h8V4H7zM1 8v3h5V8H1zm6 0v3h8V8H7zm-6 4v2h5v-2H1zm6 0v2h8v-2H7z";
const P_YAML = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm2.5 3l2 3v3h1V8l2-3h-1L5.5 7 4.5 5h-2zm6 0v1.5h2l-2 3V14h1v-1.5h2l-2-3V5h-1z";
const P_GEAR = "M8 1a.5.5 0 0 1 .5.5v1.15a4.98 4.98 0 0 1 1.95.8l.81-.82a.5.5 0 0 1 .71.71l-.82.81c.36.56.63 1.22.8 1.95H13a.5.5 0 0 1 0 1h-1.05c-.17.73-.44 1.39-.8 1.95l.82.81a.5.5 0 0 1-.71.71l-.81-.82c-.56.36-1.22.63-1.95.8V14a.5.5 0 0 1-1 0v-1.45c-.73-.17-1.39-.44-1.95-.8l-.81.82a.5.5 0 0 1-.71-.71l.82-.81c-.36-.56-.63-1.22-.8-1.95H2.5a.5.5 0 0 1 0-1h1.05c.17-.73.44-1.39.8-1.95l-.82-.81a.5.5 0 1 1 .71-.71l.81.82c.56-.36 1.22-.63 1.95-.8V1.5A.5.5 0 0 1 8 1zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z";
const P_GIT = "M15.28 7.47l-6.75-6.75a.75.75 0 0 0-1.06 0L5.72 2.47 7.6 4.35a.88.88 0 0 1 1.15 1.12l1.81 1.81a.88.88 0 1 1-.52.49L8.36 6.09v4.3a.88.88 0 1 1-.72-.02V6a.88.88 0 0 1-.48-1.15L5.34 3.03.72 7.66a.75.75 0 0 0 0 1.06l6.75 6.75a.75.75 0 0 0 1.06 0l6.75-6.75a.75.75 0 0 0 0-1.06z";
const P_DOCKER = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 4h2v2H3V6zm3 0h2v2H6V6zm3 0h2v2H9V6zm0-3h2v2H9V3zm-3 0h2v2H6V3zM3 3h2v2H3V3zm9 3h2v2h-2V6z";
const P_VITE = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm2.5 2l5.5 9 5.5-9h-2.5l-3 5-3-5h-2.5z";
const P_NPM = "M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm2.5 3v6h3V6h2v5h1V6h2v5h1V5h-9z";
const P_LOG = "M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707L9.293 0H4zm1 6h3v1H5V6zm0 2h6v1H5V8zm0 2h4v1H5v-1z";

// ---------------------------------------------------------------------------
// Lookup tables (AFTER path constants)
// ---------------------------------------------------------------------------

const SPECIAL_FILES: Record<string, FileIconDef> = {
  "package.json": { path: P_NPM, color: "#cb3837", label: "npm" },
  "tsconfig.json": { path: P_TS, color: "#3178c6", label: "TypeScript Config" },
  "vite.config.ts": { path: P_VITE, color: "#bd34fe", label: "Vite" },
  "vite.config.js": { path: P_VITE, color: "#bd34fe", label: "Vite" },
  ".gitignore": { path: P_GIT, color: "#f05032", label: "Git" },
  "Dockerfile": { path: P_DOCKER, color: "#2496ed", label: "Docker" },
  "Makefile": { path: P_GEAR, color: "#e8a838", label: "Makefile" },
  "README.md": { path: P_DOC, color: "#4078c0", label: "README" },
  "LICENSE": { path: P_DOC, color: "#d4aa00", label: "License" },
  "Cargo.toml": { path: P_RUST, color: "#dea584", label: "Rust" },
};

const EXT_ICONS: Record<string, FileIconDef> = {
  ts:   { path: P_TS, color: "#3178c6" },
  tsx:  { path: P_TSX, color: "#1a8bcc" },
  js:   { path: P_JS, color: "#f7df1e" },
  jsx:  { path: P_JSX, color: "#e8d44d" },
  mjs:  { path: P_JS, color: "#f7df1e" },
  cjs:  { path: P_JS, color: "#f7df1e" },
  html: { path: P_HTML, color: "#e44d26" },
  htm:  { path: P_HTML, color: "#e44d26" },
  svg:  { path: P_SVG, color: "#ffb13b" },
  xml:  { path: P_HTML, color: "#f16529" },
  css:  { path: P_CSS, color: "#563d7c" },
  scss: { path: P_CSS, color: "#cc6699" },
  less: { path: P_CSS, color: "#1d365d" },
  json: { path: P_JSON, color: "#a5a51a" },
  jsonl:{ path: P_JSON, color: "#a5a51a" },
  yaml: { path: P_YAML, color: "#cb171e" },
  yml:  { path: P_YAML, color: "#cb171e" },
  toml: { path: P_GEAR, color: "#9c4221" },
  csv:  { path: P_TABLE, color: "#207245" },
  md:   { path: P_MD, color: "#4078c0" },
  mdx:  { path: P_MD, color: "#f9ac00" },
  py:   { path: P_PY, color: "#3572a5" },
  rs:   { path: P_RUST, color: "#dea584" },
  c:    { path: P_C, color: "#555555" },
  h:    { path: P_C, color: "#555555" },
  cpp:  { path: P_CPP, color: "#f34b7d" },
  hpp:  { path: P_CPP, color: "#f34b7d" },
  cc:   { path: P_CPP, color: "#f34b7d" },
  go:   { path: P_GO, color: "#00add8" },
  java: { path: P_JAVA, color: "#b07219" },
  rb:   { path: P_RUBY, color: "#cc342d" },
  sh:   { path: P_SHELL, color: "#89e051" },
  bash: { path: P_SHELL, color: "#89e051" },
  zsh:  { path: P_SHELL, color: "#89e051" },
  bat:  { path: P_SHELL, color: "#c1f12e" },
  ps1:  { path: P_SHELL, color: "#012456" },
  sql:  { path: P_TABLE, color: "#e38c00" },
  png:  { path: P_IMAGE, color: "#a074c4" },
  jpg:  { path: P_IMAGE, color: "#a074c4" },
  jpeg: { path: P_IMAGE, color: "#a074c4" },
  gif:  { path: P_IMAGE, color: "#a074c4" },
  webp: { path: P_IMAGE, color: "#a074c4" },
  ico:  { path: P_IMAGE, color: "#a074c4" },
  pdf:  { path: P_PDF, color: "#db1b1b" },
  docx: { path: P_DOC, color: "#2b579a" },
  xlsx: { path: P_TABLE, color: "#217346" },
  ini:  { path: P_GEAR, color: "#8b8b8b" },
  cfg:  { path: P_GEAR, color: "#8b8b8b" },
  env:  { path: P_GEAR, color: "#ecd53f" },
  log:  { path: P_LOG, color: "#8b8b8b" },
};

const DEFAULT_ICON: FileIconDef = { path: P_FILE, color: "#8b8b8b" };

// ---------------------------------------------------------------------------
// Folder icons
// ---------------------------------------------------------------------------

export const FOLDER_ICON: FileIconDef = {
  path: "M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44L8.561 3.56a.5.5 0 0 0 .354.147H13.5A1.5 1.5 0 0 1 15 5.207V12.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z",
  color: "#dcb67a",
};

export const FOLDER_OPEN_ICON: FileIconDef = {
  path: "M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44L8.561 3.56a.5.5 0 0 0 .354.147H13.5A1.5 1.5 0 0 1 15 5.207V6H3.846a1.5 1.5 0 0 0-1.386.933L0 12.5V3.5zm0 10l2.154-5.373A.5.5 0 0 1 3.615 7.8H15.23a.5.5 0 0 1 .462.692l-1.846 4.615A.5.5 0 0 1 13.384 13.5H2.5a1.5 1.5 0 0 1-1.5-1.5v1.5z",
  color: "#dcb67a",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the icon definition for a given file name. */
export function getFileIcon(fileName: string): FileIconDef {
  const baseName = fileName.split("/").pop() ?? fileName;
  if (SPECIAL_FILES[baseName]) return SPECIAL_FILES[baseName];
  const ext = baseName.includes(".") ? baseName.split(".").pop()?.toLowerCase() ?? "" : "";
  if (EXT_ICONS[ext]) return EXT_ICONS[ext];
  return DEFAULT_ICON;
}

/** Render an inline SVG string. */
export function renderFileIconSVG(icon: FileIconDef, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="${icon.color}" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}"/></svg>`;
}
