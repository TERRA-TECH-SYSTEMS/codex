// ============================================================================
// CodeEX v2 — Core Type Definitions
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

/** Sidebar panel views */
export type PanelView = "files" | "search" | "git" | "tests" | "extensions" | "gixsis";

/** Open file tab */
export interface FileTab {
  path: string;
  name: string;
  language: string;
  modified: boolean;
  pinned?: boolean;
  preview?: boolean;
}

/** File tree node */
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  expanded?: boolean;
}

/** Chat message */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  status?: "pending" | "streaming" | "complete" | "error";
}

/** Tool call from Gixsis agent */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "complete" | "error";
}

/** Gixsis session */
export interface GixsisSession {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  cwd: string;
}

/** TerraForge model info */
export interface TerraForgeModel {
  name: string;
  id: string;
  size?: number;
  digest?: string;
}

/** TerraForge connection status */
export interface TerraForgeStatus {
  available: boolean;
  host: string;
  models: TerraForgeModel[];
}

/** Command palette action */
export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  category?: string;
  action: () => void;
}

/** Permission request from agent */
export interface PermissionRequest {
  id: string;
  tool: string;
  description: string;
  options: { id: string; label: string }[];
}

/** MCP connection status */
export interface MCPStatus {
  connected: boolean;
  sessionId: string | null;
  toolCount: number;
  serverName: string;
}

/** Bottom panel tabs */
export type BottomTab = "terminal" | "problems" | "output" | "debug";

/** Diagnostic entry for Problems panel */
export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning" | "info";
  message: string;
  source?: string;
}

/** Debug breakpoint */
export interface DebugBreakpoint {
  id: string;
  file: string;
  line: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  enabled: boolean;
}

/** Debug call stack frame */
export interface DebugStackFrame {
  id: number;
  name: string;
  file: string;
  line: number;
  column: number;
}

/** Debug variable */
export interface DebugVariable {
  name: string;
  value: string;
  type?: string;
  children?: DebugVariable[];
  expanded?: boolean;
}

/** Debug session state */
export type DebugSessionStatus = "idle" | "running" | "paused" | "stopped";

/** Debug session */
export interface DebugSession {
  status: DebugSessionStatus;
  currentFrame?: DebugStackFrame;
  callStack: DebugStackFrame[];
  variables: DebugVariable[];
  breakpoints: DebugBreakpoint[];
}

/** Ageixt todo item (CodeEX TodoWrite parity) */
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

/** User profile (from Kloak OIDC claims or future database) */
export interface UserProfile {
  sub: string;                    // Unique user ID (OIDC subject claim)
  name: string;                   // Display name
  email: string;                  // Email address
  preferredUsername?: string;      // Login username
  avatar?: string;                // Avatar URL (Kloak profile picture or Gravatar)
  roles?: string[];               // Realm/client roles
  organization?: string;          // Organization/tenant
  emailVerified?: boolean;        // Whether email is verified
  locale?: string;                // User locale preference
  createdAt?: number;             // Account creation timestamp
}

/** Authentication state */
export type AuthStatus = "authenticated" | "unauthenticated" | "expired" | "refreshing";

/** Extension manifest */
export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  activationEvents?: string[];
  contributes?: {
    commands?: { id: string; title: string }[];
    views?: Record<string, { id: string; name: string }[]>;
    themes?: { id: string; label: string; uiTheme: string }[];
    snippets?: { language: string; path: string }[];
    languages?: { id: string; extensions: string[]; aliases?: string[] }[];
  };
}
