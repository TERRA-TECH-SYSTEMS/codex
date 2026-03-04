// ============================================================================
// CodeEX v2 — TerraForge Client
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// HTTP client for TerraForge Engine (TerraForge Engine-compatible API on port 11434).
// Supports streaming chat, model listing, and health checks.
// ============================================================================

import type { TerraForgeModel, TerraForgeStatus } from "./types";

const TERRAFORGE_DIRECT = "http://terraforge.local";
// In dev, use Vite proxy to avoid CORS; in production, connect direct
const DEFAULT_HOST = import.meta.env.DEV ? "/terraforge" : TERRAFORGE_DIRECT;

let terraforgeHost = DEFAULT_HOST;

export function setTerraForgeHost(host: string) {
  terraforgeHost = host;
}

export function getTerraForgeHost(): string {
  return terraforgeHost;
}

/** Check if TerraForge is reachable and list available models. */
export async function getTerraForgeStatus(): Promise<TerraForgeStatus> {
  try {
    const res = await fetch(`${terraforgeHost}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // TerraForge returns OpenAI format {data:[...]} or TerraForge Engine format {models:[...]}
    const rawModels = data.data ?? data.models ?? [];
    const models: TerraForgeModel[] = rawModels.map((m: any) => ({
      name: m.name ?? m.id,
      id: m.id ?? m.name,
      size: m.size,
      digest: m.digest,
      status: m.status,
    }));
    return { available: true, host: terraforgeHost, models };
  } catch {
    return { available: false, host: terraforgeHost, models: [] };
  }
}

/** Streaming chat completion via TerraForge /api/chat endpoint (SSE format). */
export async function* streamChat(
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  const res = await fetch(`${terraforgeHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!res.ok) {
    throw new Error(`TerraForge chat failed: HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // TerraForge returns SSE format: "data: {...}" lines
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
          if (json.choices?.[0]?.finish_reason === "stop") return;
        } catch {
          // Skip malformed SSE lines
        }
      } else {
        // Fallback: try parsing as raw JSON (TerraForge Engine format)
        try {
          const json = JSON.parse(trimmed);
          if (json.message?.content) {
            yield json.message.content;
          }
          if (json.done) return;
        } catch {
          // Skip malformed lines
        }
      }
    }
  }
}

/** OpenAI-compatible /v1/chat/completions endpoint (for tool calling). */
export async function* streamChatV1(
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  const res = await fetch(`${terraforgeHost}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer terrapin",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!res.ok) {
    throw new Error(`TerraForge v1 chat failed: HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}

/** Non-streaming chat for quick tasks. */
export async function generate(
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(`${terraforgeHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`TerraForge generate failed: HTTP ${res.status}`);
  const data = await res.json();
  // Handle both OpenAI format and TerraForge Engine format
  return data.choices?.[0]?.message?.content ?? data.response ?? "";
}
