// ============================================================================
// CodeEX v5 — TerraForge Browser Language Model
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Browser-side LanguageModel implementation using fetch() with ReadableStream.
// Eliminates the RPC boundary between backend model and frontend chat agent,
// enabling true real-time token streaming in the Theia AI chat panel.
// ============================================================================

import {
    LanguageModel,
    LanguageModelMetaData,
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelStreamResponsePart,
    UserRequest,
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { TERRAFORGE_VENDOR, TERRAFORGE_FAMILY } from '../common/terraforge-types';

interface AccumulatedToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface TerraForgeBrowserInteraction {
    userMessage: string;
    assistantResponse: string;
    model: string;
    inputTokensEstimate: number;
    outputTokensEstimate: number;
}

export class TerraForgeBrowserModel implements LanguageModel {
    readonly id: string;
    readonly name: string;
    readonly vendor = TERRAFORGE_VENDOR;
    readonly family = TERRAFORGE_FAMILY;
    readonly maxInputTokens = 128000;
    readonly maxOutputTokens = 4096;

    private readonly defaultChatTokens = 2048;

    /** Callback for training capture — set by GixsisFrontendContribution */
    static onInteractionComplete?: (interaction: TerraForgeBrowserInteraction) => void;

    private host: string;

    constructor(
        modelId: string,
        modelName: string,
        host: string,
    ) {
        this.id = `terraforge/${modelId}`;
        this.name = modelName;
        this.host = host;
    }

    get status(): LanguageModelMetaData['status'] {
        return { status: 'ready' };
    }

    setHost(host: string): void {
        this.host = host;
    }

    private getAuthToken(): string {
        return typeof process !== 'undefined' && process.env?.TERRAFORGE_AUTH_TOKEN
            ? process.env.TERRAFORGE_AUTH_TOKEN
            : 'terrapin';
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        // Pre-flight: check if model is loaded before sending request
        await this.waitForModelReady(cancellationToken);

        const messages = this.convertMessages(request);
        const tools = this.convertTools(request);
        const requestTools = request.tools ?? [];
        const settings = request.settings ?? {};

        const hasTools = tools.length > 0;
        const maxTokens = (settings['maxTokens'] as number) ?? this.defaultChatTokens;

        const body: Record<string, unknown> = {
            model: this.id.replace('terraforge/', ''),
            messages,
            stream: true,
            temperature: (settings['temperature'] as number) ?? 0.7,
            max_tokens: maxTokens,
            repeat_penalty: 1.1,
        };

        if (hasTools) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        // Diagnostic logging — see EXACTLY what TerraForge receives
        const sysMsg = messages.find((m: Record<string, unknown>) => m.role === 'system');
        const sysContent = sysMsg ? String(sysMsg.content ?? '') : '';
        console.info('[TerraForge Request]', JSON.stringify({
            model: body.model,
            messageCount: messages.length,
            systemPromptLength: sysContent.length,
            systemPromptPreview: sysContent.slice(0, 200),
            temperature: body.temperature,
            max_tokens: body.max_tokens,
            repeat_penalty: body.repeat_penalty,
            hasTools,
            toolCount: tools.length,
        }));

        const stream = this.streamWithToolLoop(body, requestTools, cancellationToken);
        return { stream };
    }

    /**
     * Polls TerraForge Engine /api/tags until the model status is "loaded".
     * Models take 5-30s to load into VRAM on first request. Without this check,
     * the chat request hangs and gets cancelled by the framework, producing
     * the cryptic "signal is aborted without reason" error.
     *
     * Max wait: 60s with 2s polling intervals.
     */
    private async waitForModelReady(cancellationToken?: CancellationToken): Promise<void> {
        const modelName = this.id.replace('terraforge/', '');
        const MAX_POLLS = 30;
        const POLL_INTERVAL_MS = 2000;

        for (let i = 0; i < MAX_POLLS; i++) {
            if (cancellationToken?.isCancellationRequested) {
                throw new Error('Request cancelled while waiting for model to load');
            }

            try {
                const res = await fetch(`${this.host}/api/tags`, {
                    signal: AbortSignal.timeout(3000),
                });
                if (res.ok) {
                    const data = await res.json();
                    const models = data.data ?? data.models ?? [];
                    const model = models.find((m: any) => m.id === modelName || m.name === modelName);

                    if (!model) {
                        // Model not found on server — let the request proceed and fail with a clear error
                        console.warn(`[TerraForge] Model "${modelName}" not found on server`);
                        return;
                    }

                    const status = model.status?.value ?? model.status ?? 'unknown';

                    if (status === 'loaded') {
                        if (i > 0) {
                            console.info(`[TerraForge] Model "${modelName}" ready after ${i * POLL_INTERVAL_MS / 1000}s`);
                        }
                        return;
                    }

                    if (status === 'loading') {
                        console.info(`[TerraForge] Model "${modelName}" is loading into VRAM... (poll ${i + 1}/${MAX_POLLS})`);
                        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                        continue;
                    }

                    if (status === 'unloaded') {
                        // Model exists but isn't loaded — let request proceed to trigger loading
                        console.info(`[TerraForge] Model "${modelName}" is unloaded — request will trigger loading`);
                        return;
                    }

                    // Unknown status — proceed anyway
                    console.info(`[TerraForge] Model "${modelName}" status: ${status} — proceeding`);
                    return;
                }
            } catch {
                // Server unreachable — let the request proceed and fail with connection error
                console.warn(`[TerraForge] Engine health check failed (poll ${i + 1})`);
                return;
            }
        }

        throw new Error(`TerraForge model "${modelName}" is still loading after 60s. The GPU may be busy — try again shortly.`);
    }

    private convertMessages(request: LanguageModelRequest): Array<Record<string, unknown>> {
        const out: Array<Record<string, unknown>> = [];
        for (const msg of request.messages) {
            switch (msg.type) {
                case 'text':
                    out.push({
                        role: msg.actor === 'ai' ? 'assistant' : msg.actor === 'system' ? 'system' : 'user',
                        content: msg.text,
                    });
                    break;
                case 'tool_result':
                    out.push({
                        role: 'tool',
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                        tool_call_id: msg.tool_use_id,
                        name: msg.name,
                    });
                    break;
                case 'tool_use':
                    out.push({
                        role: 'assistant',
                        content: null,
                        tool_calls: [{
                            id: msg.id,
                            type: 'function',
                            function: {
                                name: msg.name,
                                arguments: typeof msg.input === 'string' ? msg.input : JSON.stringify(msg.input),
                            },
                        }],
                    });
                    break;
            }
        }
        return out;
    }

    private convertTools(request: LanguageModelRequest): Array<Record<string, unknown>> {
        if (!request.tools || request.tools.length === 0) return [];
        return request.tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description ?? '',
                parameters: {
                    type: tool.parameters.type ?? 'object',
                    properties: tool.parameters.properties,
                    required: tool.parameters.required ?? [],
                },
            },
        }));
    }

    /**
     * Streams model response using browser fetch() with ReadableStream.
     * Tokens are yielded directly — no RPC boundary, no buffering.
     *
     * Tool execution loop:
     * 1. Yields tool_call tokens to UI
     * 2. Executes each tool via handler (direct frontend call)
     * 3. Appends tool results to conversation
     * 4. Makes new fetch() for model continuation
     * 5. Repeats until model returns text (finish_reason="stop")
     */
    private async *streamWithToolLoop(
        body: Record<string, unknown>,
        requestTools: NonNullable<UserRequest['tools']>,
        cancellationToken?: CancellationToken,
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const MAX_TOOL_ROUNDS = 5;
        const messages = body.messages as Array<Record<string, unknown>>;
        let fullResponseText = '';

        // Extract last user message for training capture
        const userMessages = messages.filter(m => m.role === 'user');
        const lastUserMsg = userMessages.length > 0
            ? String(userMessages[userMessages.length - 1].content ?? '')
            : '';

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const toolCallAccumulator = new Map<number, AccumulatedToolCall>();
            let isToolCallFinish = false;

            // Make fetch request to TerraForge Engine
            const controller = new AbortController();
            if (cancellationToken) {
                cancellationToken.onCancellationRequested(() => controller.abort());
            }

            let response: Response;
            try {
                response = await fetch(`${this.host}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.getAuthToken()}`,
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
            } catch (err) {
                // Distinguish user cancellation from connection failures
                if (err instanceof DOMException && err.name === 'AbortError') {
                    if (cancellationToken?.isCancellationRequested) {
                        throw new Error('Request cancelled by user');
                    }
                    throw new Error('TerraForge Engine connection was interrupted. The model may still be loading — try again in a moment.');
                }
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ECONNREFUSED')) {
                    throw new Error(`TerraForge Engine is unreachable at ${this.host}. Check that the server is running.`);
                }
                throw new Error(`TerraForge request failed: ${msg}`);
            }

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                console.error(`[TerraForge] HTTP ${response.status} error body: ${errorBody}`);
                throw new Error(`TerraForge request failed: HTTP ${response.status} — ${errorBody.slice(0, 500)}`);
            }

            if (!response.body) {
                throw new Error('TerraForge response has no body stream');
            }

            // Read SSE stream using ReadableStream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        if (trimmed.startsWith('data: ')) {
                            const data = trimmed.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const json = JSON.parse(data);
                                const choice = json.choices?.[0];
                                if (!choice) continue;

                                // Reasoning model: skip reasoning_content tokens (chain-of-thought)
                                // Only yield delta.content (the actual response) to UI
                                const delta = choice.delta?.content;
                                if (delta) {
                                    if (!fullResponseText) {
                                        console.info('[TerraForge] Content phase started — first token received');
                                    }
                                    fullResponseText += delta;
                                    yield { content: delta };
                                }

                                // Tool calls — yield to UI AND accumulate for execution
                                const toolCalls = choice.delta?.tool_calls;
                                if (toolCalls && toolCalls.length > 0) {
                                    for (const tc of toolCalls) {
                                        const index = tc.index ?? 0;
                                        if (!toolCallAccumulator.has(index)) {
                                            toolCallAccumulator.set(index, {
                                                id: tc.id || '',
                                                name: tc.function?.name || '',
                                                arguments: tc.function?.arguments || '',
                                            });
                                        } else {
                                            const existing = toolCallAccumulator.get(index)!;
                                            if (tc.id) existing.id = tc.id;
                                            if (tc.function?.name) existing.name = tc.function.name;
                                            if (tc.function?.arguments != null) existing.arguments += tc.function.arguments;
                                        }
                                    }

                                    // Yield streaming tool call tokens for UI
                                    yield {
                                        tool_calls: toolCalls.map((tc: Record<string, unknown>) => ({
                                            id: (tc as any).id,
                                            function: {
                                                name: (tc as any).function?.name,
                                                arguments: (tc as any).function?.arguments,
                                            },
                                            finished: false,
                                        })),
                                    };
                                }

                                // Detect tool_calls finish
                                if (choice.finish_reason === 'tool_calls') {
                                    isToolCallFinish = true;
                                    const finalCalls = Array.from(toolCallAccumulator.values());
                                    yield {
                                        tool_calls: finalCalls.map(tc => ({
                                            id: tc.id,
                                            function: { name: tc.name, arguments: tc.arguments },
                                            finished: true,
                                        })),
                                    };
                                }

                                if (choice.finish_reason === 'stop') {
                                    this.emitTrainingCapture(lastUserMsg, fullResponseText);
                                    return;
                                }
                            } catch {
                                // Skip malformed SSE lines
                            }
                        } else {
                            // Fallback: TerraForge Engine native format
                            try {
                                const json = JSON.parse(trimmed);
                                if (json.message?.content) {
                                    fullResponseText += json.message.content;
                                    yield { content: json.message.content };
                                }
                                if (json.done) {
                                    this.emitTrainingCapture(lastUserMsg, fullResponseText);
                                    return;
                                }
                            } catch {
                                // Skip malformed lines
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            // If no tool calls, we're done
            if (!isToolCallFinish || toolCallAccumulator.size === 0) {
                this.emitTrainingCapture(lastUserMsg, fullResponseText);
                return;
            }

            // --- Tool execution phase ---
            const toolCallsArray = Array.from(toolCallAccumulator.values());

            // Add assistant message with tool_calls to conversation history
            messages.push({
                role: 'assistant',
                content: null,
                tool_calls: toolCallsArray.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: tc.arguments },
                })),
            });

            // Execute each tool and add results to conversation
            for (const tc of toolCallsArray) {
                const tool = requestTools.find(t => t.name === tc.name);
                if (tool) {
                    try {
                        const result = await tool.handler(tc.arguments, { toolCallId: tc.id });
                        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                        messages.push({
                            role: 'tool',
                            content: resultStr,
                            tool_call_id: tc.id,
                            name: tc.name,
                        });
                    } catch (err) {
                        messages.push({
                            role: 'tool',
                            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                            tool_call_id: tc.id,
                            name: tc.name,
                        });
                    }
                } else {
                    messages.push({
                        role: 'tool',
                        content: `Tool ${tc.name} not found`,
                        tool_call_id: tc.id,
                        name: tc.name,
                    });
                }
            }

            // Loop continues — next iteration makes new fetch() with tool results
        }

        console.warn('[TerraForge] Reached maximum tool call rounds');
    }

    private emitTrainingCapture(userMessage: string, assistantResponse: string): void {
        if (!TerraForgeBrowserModel.onInteractionComplete) return;
        if (!userMessage || !assistantResponse || assistantResponse.trim().length === 0) return;
        if (userMessage.length < 10) return;

        try {
            TerraForgeBrowserModel.onInteractionComplete({
                userMessage,
                assistantResponse,
                model: this.id,
                inputTokensEstimate: Math.ceil(userMessage.length / 4),
                outputTokensEstimate: Math.ceil(assistantResponse.length / 4),
            });
        } catch {
            // Training capture errors must never break the chat
        }
    }
}
