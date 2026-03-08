// ============================================================================
// CodeEX v5 — Proxy Backend Contribution
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Implements BackendApplicationContribution to auto-start the Gixsis Proxy
// when CodeEX launches. Also implements GixsisProxyService for RPC calls
// from the frontend monitoring UI.
//
// This does what main.ts does but inside Theia's lifecycle:
// - onStart(): load config, create modules, wire them, start proxy
// - onStop(): clean shutdown (flush JSONL, stop proxy)
//
// SAFEGUARDS (SOP-EXTCONFIG-001):
// - NEVER writes to .vscode/settings.json
// - NEVER writes to ~/.claude/settings.json
// - All state stored in .gixsis-proxy/ ONLY
// - Sets process.env.ANTHROPIC_BASE_URL ONLY for child processes of this
//   backend process (so Claude Code terminals route through proxy)
// ============================================================================

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { URL } from 'url';
import { ILogger } from '@theia/core';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ConfidenceEntry,
    GixsisProxyService,
    IdentityStatus,
    ProxyStatus,
    TrainingInteraction,
    TrainingStatus,
} from '../common/proxy-service';
import { loadConfig, type GixsisProxyConfig } from './proxy/config';
import { IdentityManager } from './proxy/identity-manager-standalone';
import { SovereignProxy, type ProxyConfig } from './proxy/sovereign-proxy';
import { StateStore } from './proxy/state-store';
import { TrainingCaptureWriter } from './proxy/training-capture-standalone';
import { TerraForgeLanguageModel } from './terraforge-language-model';

@injectable()
export class ProxyBackendContribution
    implements BackendApplicationContribution, GixsisProxyService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    private proxy: SovereignProxy | null = null;
    private identityManager: IdentityManager | null = null;
    private trainingCapture: TrainingCaptureWriter | null = null;
    private config: GixsisProxyConfig | null = null;

    // -----------------------------------------------------------------------
    // BackendApplicationContribution lifecycle
    // -----------------------------------------------------------------------

    async onStart(): Promise<void> {
        try {
            await this.startProxyInternal();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Gixsis Proxy: Failed to start — ${msg}`);
        }
    }

    onStop(): void {
        // onStop must be synchronous per Theia's contract.
        // Initiate cleanup — streams will flush to OS buffer.
        if (this.identityManager) {
            this.identityManager.stopPeriodicSync();
        }
        if (this.trainingCapture) {
            // Kick off async close but don't await (sync constraint)
            this.trainingCapture.close().catch(() => { /* best effort */ });
            this.trainingCapture = null;
        }
        if (this.proxy?.isRunning()) {
            this.proxy.stop().catch(() => { /* best effort */ });
        }
        this.proxy = null;
        this.identityManager = null;
        this.logger.info('Gixsis Proxy: Shutdown initiated');
    }

    // -----------------------------------------------------------------------
    // GixsisProxyService RPC methods (called from frontend)
    // -----------------------------------------------------------------------

    async getProxyStatus(): Promise<ProxyStatus> {
        if (!this.proxy || !this.config) {
            return this.emptyProxyStatus();
        }
        const stats = this.proxy.getStats();
        return {
            running: this.proxy.isRunning(),
            port: this.config.port,
            routingMode: this.config.routingMode,
            requests_total: stats.requests_total,
            requests_mentor: stats.requests_mentor,
            requests_sovereign: stats.requests_sovereign,
            requests_dual: stats.requests_dual,
            tokens_input_total: stats.tokens_input_total,
            tokens_output_total: stats.tokens_output_total,
            estimated_context_usage_pct: stats.estimated_context_usage_pct,
            training_pairs_captured: stats.training_pairs_captured,
            start_time: stats.start_time,
            last_request_time: stats.last_request_time,
            connect_tunnels_total: stats.connect_tunnels_total,
            connect_tunnels_intercepted: stats.connect_tunnels_intercepted,
            connect_tunnels_passthrough: stats.connect_tunnels_passthrough,
            connect_tunnels_swallowed: stats.connect_tunnels_swallowed,
        };
    }

    async getTrainingStatus(): Promise<TrainingStatus> {
        if (!this.trainingCapture) {
            return {
                enabled: false,
                sft_pairs_written: 0,
                dpo_pairs_written: 0,
                total_pairs_written: 0,
                bytes_written: 0,
                output_file: '',
                session_start: '',
                last_write: null,
            };
        }
        const stats = this.trainingCapture.getStats();
        return {
            enabled: true,
            sft_pairs_written: stats.sft_pairs_written,
            dpo_pairs_written: stats.dpo_pairs_written,
            total_pairs_written: stats.total_pairs_written,
            bytes_written: stats.bytes_written,
            output_file: stats.output_file,
            session_start: stats.session_start,
            last_write: stats.last_write,
        };
    }

    async getIdentityStatus(): Promise<IdentityStatus> {
        if (!this.identityManager) {
            return {
                badge: 'AGXT-0.0.001',
                name: 'Gixsis',
                tier: 0,
                domain: 'all',
                skills: [],
                continuationCurrent: 0,
                continuationNext: 0,
                taskCounter: 0,
                lastHandoffPath: '',
                sessionDate: '',
                activeDirectives: [],
            };
        }
        const state = this.identityManager.getState();
        return {
            badge: state.identity.badge,
            name: state.identity.name,
            tier: state.identity.tier,
            domain: state.identity.domain,
            skills: state.identity.skills,
            continuationCurrent: state.session.continuationCurrent,
            continuationNext: state.session.continuationNext,
            taskCounter: state.session.taskCounter,
            lastHandoffPath: state.session.lastHandoffPath,
            sessionDate: state.session.sessionDate,
            activeDirectives: state.session.activeDirectives,
        };
    }

    async getConfidenceRegistry(): Promise<ConfidenceEntry[]> {
        if (!this.identityManager) {
            return [];
        }
        const state = this.identityManager.getState();
        return Object.entries(state.confidence.domains).map(([domain, data]) => ({
            domain,
            score: data.score,
            tasks: data.tasks,
            trend: data.trend,
        }));
    }

    async startProxy(): Promise<void> {
        if (this.proxy?.isRunning()) {
            return;
        }
        await this.startProxyInternal();
    }

    async stopProxy(): Promise<void> {
        if (!this.proxy?.isRunning()) {
            return;
        }
        await this.proxy.stop();
        this.logger.info('Gixsis Proxy: Stopped via command');
    }

    async restartProxy(): Promise<void> {
        await this.stopProxy();
        await this.startProxyInternal();
    }

    async syncContext(): Promise<void> {
        if (this.identityManager) {
            await this.identityManager.syncFromDisk();
            this.logger.info('Gixsis Proxy: Context re-synced from disk');
        }
    }

    async writeContinuationCounter(): Promise<boolean> {
        if (this.identityManager) {
            return this.identityManager.writeContinuationToDisk();
        }
        return false;
    }

    async captureTrainingInteraction(interaction: TrainingInteraction): Promise<void> {
        if (!this.trainingCapture) return;
        if (!interaction.userMessage || !interaction.assistantResponse) return;
        try {
            this.trainingCapture.writeSftPairDirect(
                interaction.userMessage,
                interaction.assistantResponse,
                interaction.model,
                interaction.inputTokensEstimate,
                interaction.outputTokensEstimate,
            );
        } catch (err) {
            this.logger.warn('Training capture from browser model failed:', err);
        }
    }

    // -----------------------------------------------------------------------
    // Internal startup logic (mirrors main.ts)
    // -----------------------------------------------------------------------

    private async startProxyInternal(): Promise<void> {
        const config = loadConfig();
        this.config = config;

        if (!config.enabled) {
            this.logger.info('Gixsis Proxy: Disabled by configuration');
            return;
        }

        this.logger.info('Gixsis Proxy: Starting...');
        this.logger.info(`  Port: ${config.port}`);
        this.logger.info(`  Routing mode: ${config.routingMode}`);
        this.logger.info(`  Workspace root: ${config.workspaceRoot}`);

        // SAFEGUARD VERIFICATION
        this.logger.info('SAFEGUARD: NOT writing to .vscode/settings.json');
        this.logger.info('SAFEGUARD: NOT writing to ~/.claude/settings.json');
        this.logger.info('SAFEGUARD: NOT setting system environment variables');
        this.logger.info('SAFEGUARD: All state stored in ' + config.stateDir);

        // 1. State store (file-based persistence)
        const stateStore = new StateStore(config.stateDir);

        // 2. Sovereign Proxy — localhost HTTP server
        const certsDir = config.certsDir || path.join(__dirname, '..', '..', 'certs');
        const proxyConfig: ProxyConfig = {
            port: config.port,
            anthropicApiKey: config.anthropicApiKey,
            anthropicBaseUrl: config.anthropicBaseUrl,
            anthropicVersion: config.anthropicVersion,
            certsDir,
            routingMode: config.routingMode,
            sovereignEndpoint: config.sovereignEndpoint,
            sovereignConfidenceThreshold: config.sovereignConfidenceThreshold,
            dualExecutionLower: config.dualExecutionLower,
            dualExecutionUpper: config.dualExecutionUpper,
        };
        this.proxy = new SovereignProxy(proxyConfig);

        // 3. Identity Manager — Layer 2 context persistence
        const loggerAdapter = {
            appendLine: (msg: string) => { this.logger.info(msg); },
            clear: () => { /* no-op */ },
            show: () => { /* no-op */ },
            dispose: () => { /* no-op */ },
        };
        this.identityManager = new IdentityManager(
            stateStore,
            config.workspaceRoot,
            loggerAdapter,
        );

        // 4. Training Capture Writer — JSONL output for nootIQ pipeline
        if (config.trainingCaptureEnabled) {
            this.trainingCapture = new TrainingCaptureWriter(
                config.trainingOutputDir,
                this.identityManager,
                loggerAdapter,
            );
        }

        // Wire modules together
        if (config.contextInjectionEnabled) {
            await this.identityManager.initialize(this.proxy);
            this.logger.info('Gixsis Proxy: Layer 1 + Layer 2 context injection ACTIVE');
        }

        if (this.trainingCapture) {
            await this.trainingCapture.initialize(this.proxy);
            this.logger.info('Gixsis Proxy: Training capture ACTIVE — JSONL output enabled');

            // Wire native chat path (TerraForge direct) into training capture
            const captureRef = this.trainingCapture;
            TerraForgeLanguageModel.onInteractionComplete = (interaction) => {
                captureRef.writeSftPairDirect(
                    interaction.userMessage,
                    interaction.assistantResponse,
                    interaction.model,
                    interaction.inputTokensEstimate,
                    interaction.outputTokensEstimate,
                );
            };
            this.logger.info('Gixsis Proxy: Native chat training capture WIRED');
        }

        // Proxy event listeners
        this.proxy.on('started', (info: { port: number }) => {
            this.logger.info(`Gixsis Proxy: STARTED on port ${info.port}`);
            this.logger.info(`  Health check: http://127.0.0.1:${info.port}/health`);
        });

        this.proxy.on('stopped', () => {
            this.logger.info('Gixsis Proxy: STOPPED');
        });

        this.proxy.on('error', (err: Error) => {
            this.logger.error(`Gixsis Proxy: ERROR — ${err.message}`);
        });

        this.proxy.on('compaction-warning',
            (data: { pct: number; tokens: number; window: number }) => {
                const level = data.pct >= 95 ? 'CRITICAL'
                    : data.pct >= 90 ? 'URGENT'
                    : data.pct >= 80 ? 'WARNING'
                    : 'ALERT';
                this.logger.warn(
                    `Gixsis Proxy: [${level}] Compact Protocol: ` +
                    `${data.pct}% context used (${data.tokens} / ${data.window} tokens)`
                );
            },
        );

        // Start the proxy
        await this.proxy.start();

        // Set ANTHROPIC_BASE_URL on the backend process environment so
        // child processes (terminals) route through the proxy.
        process.env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${config.port}`;

        this.logger.info('Gixsis Proxy: Initialized successfully');

        // Check handoff threshold
        if (this.identityManager.isHandoffRequired()) {
            this.logger.warn(
                'Gixsis Proxy: MANDATORY HANDOFF — 10-task threshold reached'
            );
        }

        // --- Startup Health Validation ---
        this.runStartupHealthChecks(config);
    }

    private runStartupHealthChecks(config: GixsisProxyConfig): void {
        const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

        // Check 1: Proxy is listening
        checks.push({
            name: 'Proxy Listening',
            ok: this.proxy?.isRunning() ?? false,
            detail: `http://127.0.0.1:${config.port}`,
        });

        // Check 2: Workspace root contains expected markers
        const hasClaudeMd = fs.existsSync(path.join(config.workspaceRoot, 'CLAUDE.md'));
        const hasAgeixtic = fs.existsSync(path.join(config.workspaceRoot, '01-ageixtic'));
        checks.push({
            name: 'Workspace Root',
            ok: hasClaudeMd || hasAgeixtic,
            detail: `${config.workspaceRoot} (CLAUDE.md: ${hasClaudeMd}, 01-ageixtic: ${hasAgeixtic})`,
        });

        // Check 3: Identity file resolvable (canonical location: ~/.claude/GIXSIS_IDENTITY.md)
        const identityPath = path.join(
            process.env.USERPROFILE || process.env.HOME || '',
            '.claude', 'GIXSIS_IDENTITY.md',
        );
        const hasIdentity = fs.existsSync(identityPath);
        checks.push({
            name: 'Identity File',
            ok: hasIdentity,
            detail: hasIdentity ? identityPath : `NOT FOUND at ${identityPath}`,
        });

        // Check 4: Training output directory writable
        let trainingDirOk = false;
        try {
            fs.mkdirSync(config.trainingOutputDir, { recursive: true });
            trainingDirOk = fs.existsSync(config.trainingOutputDir);
        } catch { /* ignore */ }
        checks.push({
            name: 'Training Output Dir',
            ok: trainingDirOk,
            detail: config.trainingOutputDir,
        });

        // Check 5: TerraForge reachable (async, non-blocking — results logged when ready)
        try {
            const url = new URL(`${config.sovereignEndpoint}/api/tags`);
            const req = http.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'GET',
                timeout: 5000,
            }, (res) => {
                this.logger.info(`  [${res.statusCode === 200 ? 'PASS' : 'FAIL'}] TerraForge Engine: ${config.sovereignEndpoint} — HTTP ${res.statusCode}`);
                res.resume();
            });
            req.on('error', () => {
                this.logger.warn(`  [FAIL] TerraForge Engine: ${config.sovereignEndpoint} — UNREACHABLE`);
            });
            req.on('timeout', () => {
                req.destroy();
                this.logger.warn(`  [FAIL] TerraForge Engine: ${config.sovereignEndpoint} — TIMEOUT`);
            });
            req.end();
        } catch {
            this.logger.warn(`  [FAIL] TerraForge Engine: ${config.sovereignEndpoint} — ERROR`);
        }

        // Log synchronous health check results
        this.logger.info('Gixsis Proxy: --- STARTUP HEALTH CHECKS ---');
        let allOk = true;
        for (const check of checks) {
            const symbol = check.ok ? 'PASS' : 'FAIL';
            if (check.ok) {
                this.logger.info(`  [${symbol}] ${check.name}: ${check.detail}`);
            } else {
                this.logger.warn(`  [${symbol}] ${check.name}: ${check.detail}`);
                allOk = false;
            }
        }
        this.logger.info(`Gixsis Proxy: Health: ${allOk ? 'LOCAL CHECKS PASSED' : 'SOME CHECKS FAILED — see above'} (TerraForge check async)`);
    }

    private emptyProxyStatus(): ProxyStatus {
        return {
            running: false,
            port: 0,
            routingMode: 'passthrough-capture',
            requests_total: 0,
            requests_mentor: 0,
            requests_sovereign: 0,
            requests_dual: 0,
            tokens_input_total: 0,
            tokens_output_total: 0,
            estimated_context_usage_pct: 0,
            training_pairs_captured: 0,
            start_time: '',
            last_request_time: null,
            connect_tunnels_total: 0,
            connect_tunnels_intercepted: 0,
            connect_tunnels_passthrough: 0,
            connect_tunnels_swallowed: 0,
        };
    }
}
