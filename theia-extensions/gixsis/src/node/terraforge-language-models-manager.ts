// ============================================================================
// CodeEX v5 — TerraForge Language Models Manager
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Discovers models from TerraForge /api/tags, merges with defaults,
// and registers them with the Theia AI LanguageModelRegistry.
//
// NOTE: This class must be bound INSIDE a ConnectionContainerModule so that
// LanguageModelRegistry is available (it is NOT in the root backend container).
// ============================================================================

import * as http from 'http';
import { LanguageModelRegistry } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    DEFAULT_MODELS, DEFAULT_TERRAFORGE_HOST, TerraForgeLanguageModelsManager,
    TerraForgeModel
} from '../common/terraforge-types';
import { TerraForgeLanguageModel } from './terraforge-language-model';

@injectable()
export class TerraForgeLanguageModelsManagerImpl implements TerraForgeLanguageModelsManager {

    @inject(LanguageModelRegistry)
    protected readonly registry: LanguageModelRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    private registeredModelIds: string[] = [];

    async createOrUpdateLanguageModels(host: string): Promise<void> {
        const effectiveHost = host || DEFAULT_TERRAFORGE_HOST;

        // Register defaults first
        this.registerModels(DEFAULT_MODELS, effectiveHost);

        // Then try discovery
        await this.discoverModels(effectiveHost);
    }

    private registerModels(modelDescs: TerraForgeModel[], host: string): void {
        const existingIds = new Set(this.registeredModelIds);
        const newModels = modelDescs.filter(m => !existingIds.has(`terraforge/${m.id}`));

        if (newModels.length > 0) {
            const models = newModels.map(m =>
                new TerraForgeLanguageModel(m.id, m.name, host)
            );
            this.registry.addLanguageModels(models);
            this.registeredModelIds.push(...models.map(m => m.id));
            this.logger.info(`TerraForge: Registered ${newModels.length} models`);
        }
    }

    private discoverModels(host: string): Promise<void> {
        return new Promise<void>(resolve => {
            const url = new URL(`${host}/api/tags`);
            const req = http.get({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                timeout: 15000,
            }, res => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const rawModels = data.data ?? data.models ?? [];
                        const discovered: TerraForgeModel[] = rawModels.map((m: any) => ({
                            name: m.name ?? m.id,
                            id: m.id ?? m.name,
                        }));
                        this.registerModels(discovered, host);
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        this.logger.info(`TerraForge: Discovery parse error (${msg})`);
                    }
                    resolve();
                });
            });
            req.on('error', (err: Error) => {
                this.logger.info(`TerraForge: Engine not reachable (${err.message})`);
                resolve();
            });
            req.on('timeout', () => {
                req.destroy();
                this.logger.info('TerraForge: Engine discovery timed out');
                resolve();
            });
        });
    }
}
