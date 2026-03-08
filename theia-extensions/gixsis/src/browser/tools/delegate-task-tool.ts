// ============================================================================
// CodeEX v5 — Delegate Task Tool
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Spawns a focused sub-agent with read-only tool access for research tasks.
// ============================================================================

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class DelegateTaskTool implements ToolProvider {
    static ID = 'codex_delegate_task';

    getTool(): ToolRequest {
        return {
            id: DelegateTaskTool.ID,
            name: DelegateTaskTool.ID,
            providerName: 'codex-gixsis',
            description: 'Spawn a focused sub-agent to perform research or exploration. The sub-agent has read-only access and runs autonomously. Returns the sub-agent\'s findings. Use for codebase exploration, searching for patterns, or gathering information.',
            parameters: {
                type: 'object',
                properties: {
                    description: { type: 'string', description: 'Short (3-5 word) summary of the task' },
                    prompt: { type: 'string', description: 'Detailed task description for the sub-agent' },
                },
                required: ['description', 'prompt'],
            },
            handler: async (argString: string) => {
                const { description, prompt } = JSON.parse(argString);
                if (!prompt) {
                    return JSON.stringify({ error: 'prompt is required' });
                }
                // In Phase 3 the sub-agent delegates via ChatService.
                // For now, return a placeholder indicating the task was received.
                return JSON.stringify({
                    status: 'delegated',
                    description,
                    note: 'Sub-agent delegation will be fully wired when ChatService integration is complete.',
                    prompt_received: prompt.substring(0, 200),
                });
            },
        };
    }
}
