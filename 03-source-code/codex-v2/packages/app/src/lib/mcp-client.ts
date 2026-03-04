// ============================================================================
// CodeEX v2 — MCP Client (Streamable HTTP Transport)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Implements MCP (Model Context Protocol) client over Streamable HTTP.
// Connects to ageixtic-mcp server for sovereign tool access.
// Protocol: JSON-RPC 2.0 | Transport: Streamable HTTP | Session: stateful
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** MCP tool definition as returned by tools/list. */
export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/** MCP tool call result content block. */
export interface MCPContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
}

/** Result from tools/call. */
export interface MCPToolResult {
  content: MCPContentBlock[];
  isError?: boolean;
}

/** Active MCP session state. */
export interface MCPSession {
  sessionId: string;
  serverName: string;
  serverVersion: string;
  protocolVersion: string;
  tools: MCPToolDef[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MCP_DIRECT = "http://mcp.ageixtic.local";
const DEFAULT_ENDPOINT = import.meta.env.DEV ? "" : MCP_DIRECT;

let mcpEndpoint = DEFAULT_ENDPOINT;
let activeSession: MCPSession | null = null;
let nextRequestId = 1;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

export function setMCPEndpoint(endpoint: string) {
  mcpEndpoint = endpoint;
}

export function getMCPEndpoint(): string {
  return mcpEndpoint;
}

export function getSession(): MCPSession | null {
  return activeSession;
}

export function isConnected(): boolean {
  return activeSession !== null;
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, params?: Record<string, unknown>): {
  jsonrpc: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
} {
  return {
    jsonrpc: "2.0",
    id: nextRequestId++,
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

function makeNotification(method: string, params?: Record<string, unknown>): {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
} {
  return {
    jsonrpc: "2.0",
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

/** Parse SSE response body — handles both direct JSON and SSE event streams. */
async function parseSSEResponse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") ?? "";

  // Direct JSON response
  if (contentType.includes("application/json")) {
    return res.json();
  }

  // SSE stream — collect event data
  const text = await res.text();
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      const data = trimmed.slice(6);
      if (data && data !== "[DONE]") {
        try {
          return JSON.parse(data);
        } catch {
          // Continue to next line
        }
      }
    }
  }

  // Fallback: try parsing entire body as JSON
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected MCP response format: ${contentType}`);
  }
}

// ---------------------------------------------------------------------------
// Core MCP operations
// ---------------------------------------------------------------------------

/** Send a JSON-RPC message to the MCP server. */
async function mcpRequest(
  body: Record<string, unknown>,
  timeoutMs: number = 30000,
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };

  if (activeSession?.sessionId) {
    headers["Mcp-Session-Id"] = activeSession.sessionId;
  }

  const res = await fetch(`${mcpEndpoint}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MCP HTTP ${res.status}: ${errText}`);
  }

  // Extract session ID from response headers (set on initialize)
  const sessionId = res.headers.get("mcp-session-id");
  if (sessionId && activeSession) {
    activeSession.sessionId = sessionId;
  }

  return { response: await parseSSEResponse(res), headers: res.headers };
}

/** Send a JSON-RPC notification (no response expected, but server may respond). */
async function mcpNotify(body: Record<string, unknown>): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };

  if (activeSession?.sessionId) {
    headers["Mcp-Session-Id"] = activeSession.sessionId;
  }

  await fetch(`${mcpEndpoint}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Notifications are fire-and-forget
  });
}

/**
 * Initialize an MCP session with the server.
 * Performs the full handshake: initialize → notifications/initialized → tools/list.
 */
export async function initializeSession(): Promise<MCPSession> {
  // Clean up any existing session
  activeSession = null;

  // Step 1: Send initialize request
  const initMsg = makeRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "CodeEX",
      version: "2.0.0",
    },
  });

  const initHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };

  const initRes = await fetch(`${mcpEndpoint}/mcp`, {
    method: "POST",
    headers: initHeaders,
    body: JSON.stringify(initMsg),
    signal: AbortSignal.timeout(30000),
  });

  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => "");
    throw new Error(`MCP initialize failed: HTTP ${initRes.status} — ${errText}`);
  }

  const sessionId = initRes.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("MCP server did not return mcp-session-id header");
  }

  const initData = await parseSSEResponse(initRes);
  const result = initData.result ?? initData;

  // Create session with data from init response
  activeSession = {
    sessionId,
    serverName: result.serverInfo?.name ?? "ageixtic-mcp",
    serverVersion: result.serverInfo?.version ?? "unknown",
    protocolVersion: result.protocolVersion ?? "2025-03-26",
    tools: [],
  };

  // Step 2: Send initialized notification
  await mcpNotify(makeNotification("notifications/initialized"));

  // Step 3: Discover tools
  const toolsResult = await mcpRequest(makeRequest("tools/list"), 30000);
  const toolsData = toolsResult.response.result ?? toolsResult.response;
  activeSession.tools = (toolsData.tools ?? []) as MCPToolDef[];

  // Reset reconnect delay on success
  reconnectDelay = 1000;

  return activeSession;
}

/** Call an MCP tool by name with arguments. */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<MCPToolResult> {
  if (!activeSession) {
    throw new Error("MCP session not initialized. Call initializeSession() first.");
  }

  const msg = makeRequest("tools/call", { name, arguments: args });
  const { response } = await mcpRequest(msg, 120000);
  const result = response.result ?? response;

  return {
    content: result.content ?? [{ type: "text", text: JSON.stringify(result) }],
    isError: result.isError ?? false,
  };
}

/** Disconnect and clean up the active session. */
export function disconnectSession(): void {
  activeSession = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = 1000;
}

/**
 * Connect to MCP server with automatic retry.
 * Non-blocking — calls onConnect/onError callbacks.
 */
export function connectWithRetry(
  onConnect: (session: MCPSession) => void,
  onError: (error: string) => void,
): void {
  const attempt = async () => {
    try {
      const session = await initializeSession();
      onConnect(session);
    } catch (err: any) {
      const msg = err.message || "MCP connection failed";
      onError(msg);

      // Schedule retry with exponential backoff
      reconnectTimer = setTimeout(attempt, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }
  };

  attempt();
}
