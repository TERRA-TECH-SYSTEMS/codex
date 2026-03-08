// ============================================================================
// CodeEX v5 — Proxy Monitor Contribution (Frontend)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Replicates the full monitoring dashboard from the VS Code extension:
// - Status bar: proxy status + active ageixt badge
// - 9 commands: start, stop, restart, showStatus, showTrainingLog,
//   selectAgeixt, injectContext, viewConfidenceRegistry, setAnthropicBaseUrl
// - Output channel: routing stats, token usage, training capture,
//   identity state, confidence registry, extraction pipeline
// - Polling: 30-second interval for live status bar updates
// - Compaction warnings: MessageService.warn() at 90%+ context usage
// ============================================================================

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import {
    StatusBar,
    StatusBarAlignment,
} from '@theia/core/lib/browser/status-bar/status-bar-types';
import { MessageService } from '@theia/core';
import {
    Command,
    CommandContribution,
    CommandRegistry,
} from '@theia/core/lib/common/command';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import type { OutputChannel } from '@theia/output/lib/browser/output-channel';
import {
    GixsisProxyService,
    type ProxyStatus,
} from '../common/proxy-service';

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export namespace GixsisProxyCommands {
    export const START: Command = {
        id: 'gixsis-proxy.start',
        label: 'Gixsis: Start Proxy',
        category: 'Gixsis',
    };
    export const STOP: Command = {
        id: 'gixsis-proxy.stop',
        label: 'Gixsis: Stop Proxy',
        category: 'Gixsis',
    };
    export const RESTART: Command = {
        id: 'gixsis-proxy.restart',
        label: 'Gixsis: Restart Proxy',
        category: 'Gixsis',
    };
    export const SHOW_STATUS: Command = {
        id: 'gixsis-proxy.showStatus',
        label: 'Gixsis: Show Proxy Status',
        category: 'Gixsis',
    };
    export const SHOW_TRAINING_LOG: Command = {
        id: 'gixsis-proxy.showTrainingLog',
        label: 'Gixsis: Show Training Log',
        category: 'Gixsis',
    };
    export const SELECT_AGEIXT: Command = {
        id: 'gixsis-proxy.selectAgeixt',
        label: 'Gixsis: Select Active Ageixt',
        category: 'Gixsis',
    };
    export const INJECT_CONTEXT: Command = {
        id: 'gixsis-proxy.injectContext',
        label: 'Gixsis: Re-sync Context from Disk',
        category: 'Gixsis',
    };
    export const VIEW_CONFIDENCE: Command = {
        id: 'gixsis-proxy.viewConfidenceRegistry',
        label: 'Gixsis: View Confidence Registry',
        category: 'Gixsis',
    };
    export const SET_BASE_URL: Command = {
        id: 'gixsis-proxy.setAnthropicBaseUrl',
        label: 'Gixsis: Configure ANTHROPIC_BASE_URL',
        category: 'Gixsis',
    };
}

// ---------------------------------------------------------------------------
// Status bar element IDs
// ---------------------------------------------------------------------------

const STATUS_BAR_PROXY_ID = 'gixsis-proxy-status';
const STATUS_BAR_AGEIXT_ID = 'gixsis-proxy-ageixt';
const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Contribution
// ---------------------------------------------------------------------------

@injectable()
export class ProxyMonitorContribution
    implements FrontendApplicationContribution, CommandContribution {

    @inject(GixsisProxyService)
    protected readonly proxyService: GixsisProxyService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    protected channel: OutputChannel | undefined;
    protected pollTimer: ReturnType<typeof setInterval> | undefined;
    protected lastCompactionWarnPct = 0;

    @postConstruct()
    protected init(): void {
        this.channel = this.outputChannelManager.getChannel('Gixsis Proxy');
    }

    // -----------------------------------------------------------------------
    // FrontendApplicationContribution
    // -----------------------------------------------------------------------

    async onStart(): Promise<void> {
        await this.updateStatusBar();
        this.startPolling();
    }

    onStop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    // -----------------------------------------------------------------------
    // CommandContribution
    // -----------------------------------------------------------------------

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GixsisProxyCommands.START, {
            execute: async () => {
                try {
                    await this.proxyService.startProxy();
                    this.messageService.info('Gixsis Proxy started.');
                    await this.updateStatusBar();
                } catch (err: unknown) {
                    this.messageService.error(`Failed to start proxy: ${err}`);
                }
            },
        });

        registry.registerCommand(GixsisProxyCommands.STOP, {
            execute: async () => {
                try {
                    await this.proxyService.stopProxy();
                    this.messageService.info('Gixsis Proxy stopped.');
                    await this.updateStatusBar();
                } catch (err: unknown) {
                    this.messageService.error(`Failed to stop proxy: ${err}`);
                }
            },
        });

        registry.registerCommand(GixsisProxyCommands.RESTART, {
            execute: async () => {
                try {
                    await this.proxyService.restartProxy();
                    this.messageService.info('Gixsis Proxy restarted.');
                    await this.updateStatusBar();
                } catch (err: unknown) {
                    this.messageService.error(`Failed to restart proxy: ${err}`);
                }
            },
        });

        registry.registerCommand(GixsisProxyCommands.SHOW_STATUS, {
            execute: () => this.showFullStatus(),
        });

        registry.registerCommand(GixsisProxyCommands.SHOW_TRAINING_LOG, {
            execute: () => this.showTrainingLog(),
        });

        registry.registerCommand(GixsisProxyCommands.SELECT_AGEIXT, {
            execute: async () => {
                const identity = await this.proxyService.getIdentityStatus();
                this.messageService.info(
                    `Active ageixt: ${identity.badge} (${identity.name}) — ` +
                    `Tier ${identity.tier}, Domain: ${identity.domain}`
                );
            },
        });

        registry.registerCommand(GixsisProxyCommands.INJECT_CONTEXT, {
            execute: async () => {
                try {
                    await this.proxyService.syncContext();
                    this.messageService.info(
                        'Context re-synced from disk. Layer 2 updated.'
                    );
                } catch (err: unknown) {
                    this.messageService.error(`Context sync failed: ${err}`);
                }
            },
        });

        registry.registerCommand(GixsisProxyCommands.VIEW_CONFIDENCE, {
            execute: () => this.showConfidenceRegistry(),
        });

        registry.registerCommand(GixsisProxyCommands.SET_BASE_URL, {
            execute: async () => {
                const status = await this.proxyService.getProxyStatus();
                if (status.running) {
                    this.messageService.info(
                        `Proxy running on port ${status.port}. ` +
                        `Set ANTHROPIC_BASE_URL=http://127.0.0.1:${status.port} in your terminal.`
                    );
                } else {
                    this.messageService.warn(
                        'Proxy is not running. Start it first with "Gixsis: Start Proxy".'
                    );
                }
            },
        });
    }

    // -----------------------------------------------------------------------
    // Status bar updates
    // -----------------------------------------------------------------------

    protected async updateStatusBar(): Promise<void> {
        try {
            const status = await this.proxyService.getProxyStatus();
            const identity = await this.proxyService.getIdentityStatus();

            // Proxy status
            let text: string;
            let color: string | undefined;
            if (!status.running) {
                text = '$(circle-slash) Proxy: Inactive';
                color = undefined;
            } else if (status.estimated_context_usage_pct >= 90) {
                text = `$(radio-tower) Proxy: ${status.estimated_context_usage_pct}%`;
                color = '#ff453a';
            } else if (status.estimated_context_usage_pct >= 70) {
                text = `$(radio-tower) Proxy: ${status.estimated_context_usage_pct}%`;
                color = '#ff9f0a';
            } else {
                text = `$(radio-tower) Proxy: ${status.requests_total} req`;
                color = undefined;
            }

            this.statusBar.setElement(STATUS_BAR_PROXY_ID, {
                text,
                alignment: StatusBarAlignment.LEFT,
                command: GixsisProxyCommands.SHOW_STATUS.id,
                tooltip: 'Gixsis Proxy — Click to show routing status',
                priority: 100,
                color,
            });

            // Active ageixt badge
            this.statusBar.setElement(STATUS_BAR_AGEIXT_ID, {
                text: `$(person) ${identity.badge}`,
                alignment: StatusBarAlignment.LEFT,
                command: GixsisProxyCommands.SELECT_AGEIXT.id,
                tooltip: `Active Ageixt: ${identity.name} — Click for details`,
                priority: 99,
            });

            // Compaction warnings
            this.checkCompactionWarning(status);
        } catch {
            this.statusBar.setElement(STATUS_BAR_PROXY_ID, {
                text: '$(error) Proxy: Error',
                alignment: StatusBarAlignment.LEFT,
                command: GixsisProxyCommands.SHOW_STATUS.id,
                tooltip: 'Gixsis Proxy — RPC connection error',
                priority: 100,
                color: '#ff453a',
            });
        }
    }

    protected checkCompactionWarning(status: ProxyStatus): void {
        const pct = status.estimated_context_usage_pct;

        // At 80%: persist continuation counter to disk
        if (pct >= 80 && this.lastCompactionWarnPct < 80) {
            this.proxyService.writeContinuationCounter().catch(() => { /* best effort */ });
            this.proxyService.syncContext().catch(() => { /* best effort */ });
            if (this.channel) {
                this.channel.appendLine(`[COMPACT PROTOCOL 80%] State capture initiated — continuation counter written to disk.`);
            }
        }

        // At 90%: warn user to begin handoff
        if (pct >= 90 && this.lastCompactionWarnPct < 90) {
            const level = pct >= 95 ? 'CRITICAL' : 'URGENT';
            this.messageService.warn(
                `COMPACT PROTOCOL ${pct}% [${level}] — ` +
                `Context window nearing capacity. Begin handoff procedures.`
            );
            this.proxyService.writeContinuationCounter().catch(() => { /* best effort */ });
        }

        // At 95%: final state flush
        if (pct >= 95 && this.lastCompactionWarnPct < 95) {
            this.messageService.error(
                `COMPACT PROTOCOL 95% [CRITICAL] — Preservation is the ONLY priority. ` +
                `Create handoff NOW.`
            );
            this.proxyService.writeContinuationCounter().catch(() => { /* best effort */ });
        }

        this.lastCompactionWarnPct = pct;
    }

    protected startPolling(): void {
        this.pollTimer = setInterval(() => {
            this.updateStatusBar();
        }, POLL_INTERVAL_MS);
    }

    // -----------------------------------------------------------------------
    // Output channel: Full status dashboard
    // -----------------------------------------------------------------------

    protected async showFullStatus(): Promise<void> {
        if (!this.channel) { return; }

        const [status, training, identity, confidence] = await Promise.all([
            this.proxyService.getProxyStatus(),
            this.proxyService.getTrainingStatus(),
            this.proxyService.getIdentityStatus(),
            this.proxyService.getConfidenceRegistry(),
        ]);

        this.channel.clear();
        const w = (s: string) => this.channel!.appendLine(s);

        w('===============================================================');
        w('  GIXSIS PROXY — SOVEREIGN INTELLIGENCE ROUTER');
        w('  TerraTech Systems — CodeEX v5');
        w('===============================================================');
        w('');
        w(`  Status:          ${status.running ? 'ACTIVE' : 'INACTIVE'}`);
        w(`  Port:            ${status.port}`);
        w(`  Proxy URL:       http://127.0.0.1:${status.port}`);
        w(`  Routing Mode:    ${status.routingMode}`);
        w(`  Start Time:      ${status.start_time || '(not started)'}`);
        w(`  Last Request:    ${status.last_request_time || '(none)'}`);
        w('');

        w('-- ROUTING STATISTICS --');
        w(`  Total Requests:  ${status.requests_total}`);
        w(`  Mentor:          ${status.requests_mentor}`);
        w(`  Sovereign:       ${status.requests_sovereign}`);
        w(`  Dual:            ${status.requests_dual}`);
        w('');

        w('-- CONNECT TUNNEL STATISTICS --');
        w(`  Total Tunnels:   ${status.connect_tunnels_total}`);
        w(`  Intercepted:     ${status.connect_tunnels_intercepted}`);
        w(`  Passthrough:     ${status.connect_tunnels_passthrough}`);
        w(`  Swallowed:       ${status.connect_tunnels_swallowed}`);
        w('');

        w('-- TOKEN USAGE --');
        w(`  Input Tokens:    ${status.tokens_input_total.toLocaleString()}`);
        w(`  Output Tokens:   ${status.tokens_output_total.toLocaleString()}`);
        w(`  Context Usage:   ${status.estimated_context_usage_pct}%`);
        w(`  Pairs Captured:  ${status.training_pairs_captured}`);
        w('');

        w('-- ACTIVE AGEIXT --');
        w(`  Badge:           ${identity.badge}`);
        w(`  Name:            ${identity.name}`);
        w(`  Tier:            ${identity.tier}`);
        w(`  Domain:          ${identity.domain}`);
        w(`  Skills:          ${identity.skills.join(', ') || '(none)'}`);
        w('');

        w('-- SESSION STATE --');
        w(`  Continuation:    ${identity.continuationCurrent} -> ${identity.continuationNext}`);
        w(`  Task Counter:    ${identity.taskCounter} / 10`);
        w(`  Last Handoff:    ${identity.lastHandoffPath || '(none)'}`);
        w(`  Session Date:    ${identity.sessionDate}`);
        w(`  Directives:      ${identity.activeDirectives.length} active`);
        w('');

        w('-- TRAINING CAPTURE --');
        if (training.enabled) {
            w(`  Status:          ACTIVE`);
            w(`  SFT Pairs:       ${training.sft_pairs_written}`);
            w(`  DPO Pairs:       ${training.dpo_pairs_written}`);
            w(`  Total Pairs:     ${training.total_pairs_written}`);
            w(`  Bytes Written:   ${training.bytes_written.toLocaleString()}`);
            w(`  Output File:     ${training.output_file}`);
            w(`  Session Start:   ${training.session_start}`);
            w(`  Last Write:      ${training.last_write || '(none)'}`);
        } else {
            w(`  Status:          DISABLED`);
        }
        w('');

        w('-- CONTEXT INJECTION --');
        w(`  Layer 1:         HARDCODED (Covenant, Trillion Protocol, Core Rules)`);
        w(`  Layer 2:         ACTIVE (Identity, Directives, State)`);
        w('');

        if (confidence.length > 0) {
            w('-- CONFIDENCE REGISTRY --');
            w('  Domain                  Score    Tasks    Trend');
            w('  ----------------------- -------- -------- ----------');
            for (const entry of confidence) {
                const d = entry.domain.padEnd(24);
                const s = entry.score.toFixed(2).padEnd(9);
                const t = String(entry.tasks).padEnd(9);
                w(`  ${d}${s}${t}${entry.trend}`);
            }
            w('');
            w('  Routing Thresholds:');
            w('    >= 0.85  -> Sovereign routing (zero dependency)');
            w('    0.50-0.84 -> Dual execution (DPO pairs generated)');
            w('    < 0.50   -> Mentor routing (full capture)');
            w('');
        }

        w('===============================================================');
        this.channel.show({ preserveFocus: false });
    }

    // -----------------------------------------------------------------------
    // Output channel: Training log
    // -----------------------------------------------------------------------

    protected async showTrainingLog(): Promise<void> {
        if (!this.channel) { return; }

        const training = await this.proxyService.getTrainingStatus();

        this.channel.clear();
        const w = (s: string) => this.channel!.appendLine(s);

        w('-- TRAINING CAPTURE LOG --');
        w('');
        if (!training.enabled) {
            w('  Training capture is DISABLED.');
            w('  Enable codex.proxy.trainingCaptureEnabled in preferences.');
        } else {
            w(`  SFT Pairs Written:   ${training.sft_pairs_written}`);
            w(`  DPO Pairs Written:   ${training.dpo_pairs_written}`);
            w(`  Total Pairs:         ${training.total_pairs_written}`);
            w(`  Bytes Written:       ${training.bytes_written.toLocaleString()}`);
            w(`  Output File:         ${training.output_file}`);
            w(`  Session Start:       ${training.session_start}`);
            w(`  Last Write:          ${training.last_write || 'None'}`);
        }

        this.channel.show({ preserveFocus: false });
    }

    // -----------------------------------------------------------------------
    // Output channel: Confidence registry
    // -----------------------------------------------------------------------

    protected async showConfidenceRegistry(): Promise<void> {
        if (!this.channel) { return; }

        const confidence = await this.proxyService.getConfidenceRegistry();

        this.channel.clear();
        const w = (s: string) => this.channel!.appendLine(s);

        w('-- CONFIDENCE REGISTRY --');
        w('');

        if (confidence.length === 0) {
            w('  No confidence data recorded yet.');
        } else {
            w('  Domain                  Score    Tasks    Trend');
            w('  ----------------------- -------- -------- ----------');
            for (const entry of confidence) {
                const d = entry.domain.padEnd(24);
                const s = entry.score.toFixed(2).padEnd(9);
                const t = String(entry.tasks).padEnd(9);
                w(`  ${d}${s}${t}${entry.trend}`);
            }
        }

        w('');
        w('  Routing Thresholds:');
        w('    >= 0.85  -> Sovereign routing (zero dependency)');
        w('    0.50-0.84 -> Dual execution (DPO pairs generated)');
        w('    < 0.50   -> Mentor routing (full capture)');

        this.channel.show({ preserveFocus: false });
    }
}
