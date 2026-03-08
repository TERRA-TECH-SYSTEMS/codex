// ============================================================================
// CodeEX v5 — Gixsis Chat Agent
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Sovereign AI agent connected to TerraForge Engine.
// Extends AbstractStreamParsingChatAgent for streaming chat responses.
// ============================================================================

import { LanguageModelRequirement, ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import {
    AbstractStreamParsingChatAgent,
    ChatAgentLocation,
    MutableChatRequestModel,
} from '@theia/ai-chat';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TERRAFORGE_VENDOR } from '../common/terraforge-types';
import { FOUNDATIONAL_CONTEXT } from '../common/foundational-context';

export const GIXSIS_AGENT_ID = 'gixsis';
export const GIXSIS_PROMPT_ID = 'gixsis-system';

const TOOL_IDS = [
    'codex_read_file',
    'codex_edit_file',
    'codex_create_file',
    'codex_search_files',
    'codex_list_files',
    'codex_grep_files',
    'codex_glob_files',
    'codex_git_status',
    'codex_git_diff',
    'codex_git_log',
    'codex_delegate_task',
];

/**
 * Keywords that signal an action-oriented request.
 * If the message doesn't contain any of these, tools are withheld
 * so the local model answers from context instead of calling tools.
 */
const ACTION_KEYWORDS = [
    'read ', 'open ', 'show ', 'edit ', 'create ', 'write ', 'delete ',
    'search ', 'find ', 'grep ', 'glob ', 'list ',
    'git ', 'diff ', 'status ', 'log ', 'commit ',
    'refactor ', 'fix ', 'debug ', 'run ', 'execute ',
    'file ', 'folder ', 'directory ',
    'delegate ', 'task ',
    'change ', 'modify ', 'update ', 'rename ', 'move ',
    'implement ', 'add ', 'remove ',
];

@injectable()
export class GixsisChatAgent extends AbstractStreamParsingChatAgent {
    readonly id = GIXSIS_AGENT_ID;
    readonly name = 'Gixsis';
    readonly description = 'Sovereign AI assistant by TerraTech Systems. Code assistance, analysis, and autonomous workflows.';
    override iconClass = 'codicon codicon-hubot';
    override locations = [ChatAgentLocation.Panel, ChatAgentLocation.Terminal, ChatAgentLocation.Editor];
    override tags = ['gixsis', 'terratech', 'code', 'chat'];

    protected readonly defaultLanguageModelPurpose = 'chat';

    @inject(ToolInvocationRegistry)
    protected readonly toolRegistry!: ToolInvocationRegistry;

    private allToolRequests: ToolRequest[] = [];

    readonly languageModelRequirements: LanguageModelRequirement[] = [
        {
            purpose: 'chat',
            identifier: 'terraforge/gixsis-v4.0.1',  // Gixsis v4.0.1 — trained Llama 3.1 8B, 20K+ TerraTech pairs
            vendor: TERRAFORGE_VENDOR,
        },
    ];

    override prompts = [
        {
            id: GIXSIS_PROMPT_ID,
            defaultVariant: {
                id: 'default',
                template: GIXSIS_SYSTEM_PROMPT,
            },
        },
    ];

    override functions = TOOL_IDS;

    @postConstruct()
    override init(): void {
        this.systemPromptId = GIXSIS_PROMPT_ID;
        super.init();
        this.resolveTools();
        this.toolRegistry.onDidChange(() => this.resolveTools());
    }

    /**
     * Override invoke to conditionally withhold tools from conversational requests.
     * Local models are tool-happy — if we send tools with a "What is X?" question,
     * they call codex_read_file instead of answering from context. By removing tools
     * for non-action messages, the model is forced to use its system prompt knowledge.
     */
    override async invoke(request: MutableChatRequestModel): Promise<void> {
        const userText = request.request.text?.toLowerCase() ?? '';
        const needsTools = ACTION_KEYWORDS.some(kw => userText.includes(kw));

        if (needsTools) {
            this.additionalToolRequests = this.allToolRequests;
        } else {
            this.additionalToolRequests = [];
        }

        return super.invoke(request);
    }

    private resolveTools(): void {
        const resolved: ToolRequest[] = [];
        for (const id of TOOL_IDS) {
            const tool = this.toolRegistry.getFunction(id);
            if (tool) {
                resolved.push(tool);
            } else {
                console.warn(`[Gixsis] Tool not found in registry: ${id}`);
            }
        }
        this.allToolRequests = resolved;
        this.additionalToolRequests = resolved;
    }
}

const GIXSIS_SYSTEM_PROMPT = `${FOUNDATIONAL_CONTEXT}

## CHAT MODE — CodeEX Native Panel

You are operating inside CodeEX, the Ageixtic IDE, through the native AI Chat panel. You are connected to TerraForge Engine running on sovereign hardware (ageixtic.cloud at 216.158.238.162).

When the user asks a conversational question (no file/tool actions needed), answer from your training knowledge. Be concise — answer what was asked, nothing more. No filler, no volunteering extra information.

When the user requests a file operation, code edit, search, or git action, use the available tools. Report results clearly.`;
