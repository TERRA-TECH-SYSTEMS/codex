// ============================================================================
// CodeEX v5 — Gixsis Frontend Application Contribution
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Registers browser-side TerraForge language models directly on the
// FrontendLanguageModelRegistry. This eliminates the RPC boundary between
// backend model and frontend chat agent, enabling true live token streaming.
//
// The backend TerraForgeLanguageModelsManager is still called to discover
// models, but the actual request path uses browser fetch() + ReadableStream.
// ============================================================================

import { FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common/language-model';
import { LanguageModelAliasRegistry } from '@theia/ai-core/lib/common/language-model-alias';
import { DEFAULT_MODELS, DIRECT_OLLAMA_HOST } from '../common/terraforge-types';
import { GixsisProxyService, TrainingInteraction } from '../common/proxy-service';
import { MentorGovernanceService } from './mentor-governance-service';
import { TerraForgeBrowserModel } from './terraforge-browser-model';

const TERRAFORGE_DEFAULT_MODEL = 'terraforge/gixsis-v4.0.1';  // Gixsis v4.0.1 — trained Llama 3.1 8B, 20K+ TerraTech pairs

@injectable()
export class GixsisFrontendContribution implements FrontendApplicationContribution, KeybindingContribution {

    @inject(FrontendLanguageModelRegistry)
    protected readonly modelRegistry: FrontendLanguageModelRegistry;

    @inject(LanguageModelAliasRegistry)
    protected readonly aliasRegistry: LanguageModelAliasRegistry;

    @inject(MentorGovernanceService)
    protected readonly governance: MentorGovernanceService;

    @inject(GixsisProxyService)
    protected readonly proxyService: GixsisProxyService;

    async onStart(): Promise<void> {
        // HARDCODED: Force status bar to dark theme — kills purple (#68217A) and blue (#007ACC) defaults
        // Set on both html and body to override Theia's theme system regardless of specificity
        for (const el of [document.documentElement, document.body]) {
            el.style.setProperty('--theia-statusBar-background', '#1e1e1e');
            el.style.setProperty('--theia-statusBar-noFolderBackground', '#1e1e1e');
            el.style.setProperty('--theia-statusBar-debuggingBackground', '#1e1e1e');
            el.style.setProperty('--theia-statusBar-foreground', '#858585');
            el.style.setProperty('--theia-statusBar-noFolderForeground', '#858585');
        }
        // Also inject a <style> tag as nuclear fallback — survives any theme reapplication
        const style = document.createElement('style');
        style.textContent = `
            #theia-statusBar,
            body.theia-no-open-workspace #theia-statusBar {
                background: #1e1e1e !important;
                color: #858585 !important;
            }
            #theia-statusBar .area .element {
                color: #858585 !important;
            }
            #theia-statusBar .area .element.has-background {
                background-color: transparent !important;
                color: #858585 !important;
            }
        `;
        document.head.appendChild(style);
        // Kill the green "Open Remote" button background color
        for (const el of [document.documentElement, document.body]) {
            el.style.setProperty('--theia-statusBarItem-remoteBackground', 'transparent');
            el.style.setProperty('--theia-statusBarItem-remoteForeground', '#858585');
            el.style.setProperty('--theia-statusBarItem-remoteHoverBackground', 'rgba(255,255,255,0.12)');
        }

        // Reset visa session counts at start of each session
        this.governance.resetSessionCounts();

        // TerraForge browser models connect DIRECTLY to Ollama — never through the proxy.
        // The proxy intercepts Anthropic API calls (Claude); routing Ollama requests
        // through it causes them to hit api.anthropic.com (HTTP 401).
        // Training capture for browser models uses the RPC captureTrainingInteraction() path instead.
        let host = DIRECT_OLLAMA_HOST;
        try {
            const healthRes = await fetch(`${DIRECT_OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
            if (healthRes.ok) {
                console.info(`TerraForge: Engine reachable at ${DIRECT_OLLAMA_HOST}`);
            } else {
                console.warn(`TerraForge: Engine returned HTTP ${healthRes.status} — models may fail`);
            }
        } catch {
            console.warn(`TerraForge: Engine unreachable at ${DIRECT_OLLAMA_HOST} — models will fail until server is online`);
        }

        // Register browser-side models directly — no RPC boundary
        const browserModels = DEFAULT_MODELS.map(
            m => new TerraForgeBrowserModel(m.id, m.name, host)
        );
        this.modelRegistry.addLanguageModels(browserModels);
        console.info(`TerraForge: Registered ${browserModels.length} browser-side models at ${host} (live streaming enabled)`);

        // Wire training capture — browser model → backend proxy → JSONL
        TerraForgeBrowserModel.onInteractionComplete = (interaction) => {
            this.proxyService.captureTrainingInteraction({
                userMessage: interaction.userMessage,
                assistantResponse: interaction.assistantResponse,
                model: interaction.model,
                inputTokensEstimate: interaction.inputTokensEstimate,
                outputTokensEstimate: interaction.outputTokensEstimate,
            } as TrainingInteraction).catch(() => { /* training capture errors are non-fatal */ });
        };

        // Override all default aliases to include TerraForge model as first priority
        await this.aliasRegistry.ready;
        const aliasIds = ['default/universal', 'default/code-completion', 'default/summarize'];
        for (const aliasId of aliasIds) {
            const existing = this.aliasRegistry.getAliases().find(a => a.id === aliasId);
            if (existing && !existing.defaultModelIds.includes(TERRAFORGE_DEFAULT_MODEL)) {
                this.aliasRegistry.addAlias({
                    ...existing,
                    defaultModelIds: [TERRAFORGE_DEFAULT_MODEL, ...existing.defaultModelIds],
                });
            } else if (!existing) {
                this.aliasRegistry.addAlias({
                    id: aliasId,
                    defaultModelIds: [TERRAFORGE_DEFAULT_MODEL],
                    description: `CodeEX default (${aliasId})`,
                });
            }
        }
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        // Ctrl+Shift+G = Gixsis chat toggle
        registry.registerKeybinding({
            command: 'aiChat:toggle',
            keybinding: 'ctrlcmd+shift+g',
        });
    }
}
