// ============================================================================
// CodeEX v2 — MCP Tool Bridge for Ageixt Mode
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Bridges MCP tool definitions to the Gixsis ageixt tool system.
// Converts MCPToolDef → ToolDef, handles MCP tool execution via callTool().
// ============================================================================

import { callTool, isConnected, getSession } from "./mcp-client";
import type { MCPToolDef } from "./mcp-client";
import type { ToolDef, ToolResult } from "./agent-tools";

/** Prefix used to namespace MCP tools in the ageixt system. */
const MCP_PREFIX = "mcp:";

/** Check if a tool name is an MCP tool. */
export function isMCPTool(name: string): boolean {
  return name.startsWith(MCP_PREFIX);
}

/** Strip the MCP prefix to get the original MCP tool name. */
function stripPrefix(name: string): string {
  return name.slice(MCP_PREFIX.length);
}

/** Convert MCP tool definitions to agent ToolDef format. */
export function convertMCPToolsToAgentTools(mcpTools: MCPToolDef[]): ToolDef[] {
  return mcpTools.map((tool) => {
    const params: Record<string, { type: string; description: string; required?: boolean }> = {};
    const props = tool.inputSchema.properties ?? {};
    const required = new Set(tool.inputSchema.required ?? []);

    for (const [key, schema] of Object.entries(props)) {
      params[key] = {
        type: schema.type,
        description: schema.description ?? key,
        required: required.has(key),
      };
    }

    return {
      name: `${MCP_PREFIX}${tool.name}`,
      description: `[MCP] ${tool.description}`,
      parameters: params,
    };
  });
}

/** Get current MCP tool definitions as agent ToolDefs. Returns empty array if not connected. */
export function getMCPToolDefs(): ToolDef[] {
  if (!isConnected()) return [];
  const session = getSession();
  if (!session) return [];
  return convertMCPToolsToAgentTools(session.tools);
}

/** Execute an MCP tool call and return an agent ToolResult. */
export async function executeMCPTool(
  toolCallId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const mcpName = stripPrefix(name);

  try {
    const result = await callTool(mcpName, input);

    // Extract text content from MCP response
    const textParts = result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);
    const output = textParts.join("\n") || "(empty response)";

    return {
      toolCallId,
      name,
      output,
      status: result.isError ? "error" : "success",
    };
  } catch (err: any) {
    return {
      toolCallId,
      name,
      output: `MCP error: ${err.message || "Tool call failed"}`,
      status: "error",
    };
  }
}
