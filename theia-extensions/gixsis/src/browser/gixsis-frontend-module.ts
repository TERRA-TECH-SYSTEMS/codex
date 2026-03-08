// ============================================================================
// CodeEX v5 — Gixsis Frontend Module
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Registers the Gixsis ChatAgent, TerraForge model manager proxy,
// proxy monitoring UI, and 11 sovereign tool providers.
// ============================================================================

import { ChatAgent } from '@theia/ai-chat';
import { ChatSessionNamingService } from '@theia/ai-chat/lib/common/chat-session-naming-service';
import { CopilotStatusBarContribution } from '@theia/ai-copilot/lib/browser/copilot-status-bar-contribution';
import { Agent, AIVariableContribution } from '@theia/ai-core';
import { bindToolProvider } from '@theia/ai-core/lib/common/tool-invocation-registry';
import {
    FrontendApplicationContribution,
    KeybindingContribution,
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandContribution } from '@theia/core/lib/common/command';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    GixsisProxyService,
    GIXSIS_PROXY_SERVICE_PATH,
} from '../common/proxy-service';
import {
    TerraForgeLanguageModelsManager,
    TERRAFORGE_LANGUAGE_MODELS_MANAGER_PATH
} from '../common/terraforge-types';
import { GixsisChatAgent } from './gixsis-chat-agent';
import { GixsisChatToolbarContribution } from './gixsis-chat-toolbar-contribution';
import { GixsisFrontendContribution } from './gixsis-frontend-contribution';
import { GixsisSTTService } from './gixsis-stt-service';
import { GixsisTTSService } from './gixsis-tts-service';
import { GixsisWorkspaceVariable } from './gixsis-workspace-variable';
import { MentorGovernanceService } from './mentor-governance-service';
import { ProxyMonitorContribution } from './proxy-monitor-contribution';
import {
    ReadFileTool, EditFileTool, CreateFileTool,
    SearchFilesTool, ListFilesTool,
    GrepFilesTool, GlobFilesTool,
    GitStatusTool, GitDiffTool, GitLogTool,
    DelegateTaskTool,
} from './tools';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    // Kill GitHub Copilot status bar — CodeEX uses Gixsis, not Copilot
    rebind(CopilotStatusBarContribution).toConstantValue({
        onStart: () => { },
        dispose: () => { },
    } as unknown as CopilotStatusBarContribution);

    // Disable AI-generated session names — TerraForge runs single-model
    // inference on one GPU. Concurrent requests (chat + session naming)
    // cause the naming request to queue and timeout at 60s, crashing the
    // React chat panel. Session titles use the first user message instead.
    rebind(ChatSessionNamingService).toConstantValue({
        generateChatSessionName: async () => undefined,
    } as unknown as ChatSessionNamingService);
    // Gixsis ChatAgent — routes through Theia AI Chat (native panel)
    bind(GixsisChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(GixsisChatAgent);
    bind(ChatAgent).toService(GixsisChatAgent);

    // TerraForge manager RPC proxy
    bind(TerraForgeLanguageModelsManager).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<TerraForgeLanguageModelsManager>(
            TERRAFORGE_LANGUAGE_MODELS_MANAGER_PATH
        );
    }).inSingletonScope();

    // Gixsis Proxy service RPC proxy — connects to backend proxy
    bind(GixsisProxyService).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<GixsisProxyService>(
            GIXSIS_PROXY_SERVICE_PATH
        );
    }).inSingletonScope();

    // Frontend contribution — triggers model registration on startup
    bind(GixsisFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(GixsisFrontendContribution);
    bind(KeybindingContribution).toService(GixsisFrontendContribution);

    // Proxy monitoring — status bar, commands, output channel dashboard
    bind(ProxyMonitorContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ProxyMonitorContribution);
    bind(CommandContribution).toService(ProxyMonitorContribution);

    // STT + TTS services
    bind(GixsisSTTService).toSelf().inSingletonScope();
    bind(GixsisTTSService).toSelf().inSingletonScope();

    // Chat toolbar — adds mic + speaker icons to the AI Chat panel
    bind(GixsisChatToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(GixsisChatToolbarContribution);
    bind(CommandContribution).toService(GixsisChatToolbarContribution);

    // Gixsis Workspace Variable — reads gixsis.md for {{gixsis-config}}
    bind(GixsisWorkspaceVariable).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(GixsisWorkspaceVariable);

    // Mentor Governance Service — Work Visa management
    bind(MentorGovernanceService).toSelf().inSingletonScope();

    // --- 11 Sovereign Tool Providers ---
    bindToolProvider(ReadFileTool, bind);
    bindToolProvider(EditFileTool, bind);
    bindToolProvider(CreateFileTool, bind);
    bindToolProvider(SearchFilesTool, bind);
    bindToolProvider(ListFilesTool, bind);
    bindToolProvider(GrepFilesTool, bind);
    bindToolProvider(GlobFilesTool, bind);
    bindToolProvider(GitStatusTool, bind);
    bindToolProvider(GitDiffTool, bind);
    bindToolProvider(GitLogTool, bind);
    bindToolProvider(DelegateTaskTool, bind);
});
