// ============================================================================
// CodeEX v5 — TerraForge Language Model
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Implements Theia AI LanguageModel interface backed by TerraForge Engine.
// SSE streaming with full tool call execution loop.
// ============================================================================

import * as http from 'http';
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

export interface TerraForgeInteraction {
    userMessage: string;
    assistantResponse: string;
    model: string;
    inputTokensEstimate: number;
    outputTokensEstimate: number;
}

export class TerraForgeLanguageModel implements LanguageModel {
    readonly id: string;
    readonly name: string;
    readonly vendor = TERRAFORGE_VENDOR;
    readonly family = TERRAFORGE_FAMILY;
    readonly maxInputTokens = 128000;
    readonly maxOutputTokens = 4096;

    /**
     * Default generation limit for chat responses.
     * maxOutputTokens (4096) is the declared capability, but most chat
     * responses are 200-500 tokens. Using 2048 as the default gives Ollama
     * more headroom within n_ctx for the system prompt + conversation.
     * Settings['maxTokens'] overrides this when explicitly set.
     */
    private readonly defaultChatTokens = 2048;

    /** Static callback for training capture — set by ProxyBackendContribution */
    static onInteractionComplete?: (interaction: TerraForgeInteraction) => void;

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

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const messages = this.convertMessages(request);
        const tools = this.convertTools(request);
        const requestTools = request.tools ?? [];
        const settings = request.settings ?? {};

        const body: Record<string, unknown> = {
            model: this.id.replace('terraforge/', ''),
            messages,
            stream: true,
            temperature: (settings['temperature'] as number) ?? 0.7,
            max_tokens: (settings['maxTokens'] as number) ?? this.defaultChatTokens,
        };

        if (tools.length > 0) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const stream = this.streamWithToolLoop(body, requestTools, cancellationToken);
        return { stream };
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
     * Streams model response with automatic tool call execution loop.
     *
     * When the model returns tool_calls (finish_reason="tool_calls"):
     * 1. Yields tool_call tokens to UI (shows "Running..." in chat)
     * 2. Executes each tool via handler (RPC to frontend)
     * 3. Appends tool results to conversation messages
     * 4. Makes a new API call for model continuation
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

            // Make HTTP request to TerraForge Engine
            const response = await this.makeHttpRequest(body, cancellationToken);
            let buffer = '';

            for await (const chunk of response) {
                buffer += chunk.toString();
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

                            // Text content — yield to UI + accumulate for training
                            const delta = choice.delta?.content;
                            if (delta) {
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
                                    tool_calls: toolCalls.map((tc: any) => ({
                                        id: tc.id,
                                        function: {
                                            name: tc.function?.name,
                                            arguments: tc.function?.arguments,
                                        },
                                        finished: false,
                                    })),
                                };
                            }

                            // Detect tool_calls finish
                            if (choice.finish_reason === 'tool_calls') {
                                isToolCallFinish = true;
                                // Yield final tool calls with finished=true
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

            // If no tool calls, we're done
            if (!isToolCallFinish || toolCallAccumulator.size === 0) {
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

            // Loop continues — next iteration makes new API call with tool results
        }

        console.warn('[TerraForge] Reached maximum tool call rounds');
    }

    private makeHttpRequest(
        body: Record<string, unknown>,
        cancellationToken?: CancellationToken,
    ): Promise<http.IncomingMessage> {
        const url = new URL(`${this.host}/v1/chat/completions`);
        const payload = JSON.stringify(body);

        return new Promise<http.IncomingMessage>((resolve, reject) => {
            const req = http.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer terrapin',
                    'Content-Length': Buffer.byteLength(payload),
                },
                timeout: 60000,
            }, res => {
                if (res.statusCode && res.statusCode >= 400) {
                    // Read the error response body for diagnostics
                    let errorBody = '';
                    res.on('data', (chunk: Buffer) => { errorBody += chunk.toString(); });
                    res.on('end', () => {
                        console.error(`[TerraForge] HTTP ${res.statusCode} error body: ${errorBody}`);
                        reject(new Error(`TerraForge request failed: HTTP ${res.statusCode} — ${errorBody.slice(0, 500)}`));
                    });
                    return;
                }
                resolve(res);
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('TerraForge request timed out'));
            });

            if (cancellationToken) {
                cancellationToken.onCancellationRequested(() => req.destroy());
            }

            req.write(payload);
            req.end();
        });
    }

    private emitTrainingCapture(userMessage: string, assistantResponse: string): void {
        if (!TerraForgeLanguageModel.onInteractionComplete) return;
        if (!userMessage || !assistantResponse || assistantResponse.trim().length === 0) return;
        if (userMessage.length < 10) return; // Skip trivial messages

        try {
            TerraForgeLanguageModel.onInteractionComplete({
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
