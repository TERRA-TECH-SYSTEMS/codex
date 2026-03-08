// ============================================================================
// CodeEX v5 — TerraForge Types
// Copyright 2026 TerraTech Systems. All rights reserved.
// ============================================================================

export interface TerraForgeModel {
    name: string;
    id: string;
    size?: number;
    digest?: string;
    status?: string;
}

export interface TerraForgeStatus {
    available: boolean;
    host: string;
    models: TerraForgeModel[];
}

// Phase 5: Route through Gixsis Proxy for classification + training capture.
// Direct Ollama fallback: 'http://216.158.238.162:11434'
export const DEFAULT_TERRAFORGE_HOST = 'http://localhost:8787';
export const DIRECT_OLLAMA_HOST = 'http://216.158.238.162:11434';

export const DEFAULT_MODELS: TerraForgeModel[] = [
    { name: 'gixsis-v4.0.1', id: 'gixsis-v4.0.1' },
    { name: 'gixsis-code-32b', id: 'gixsis-code-32b' },
    { name: 'Cain-30B', id: 'nemotron-nano-30b' },  // Deep reasoning model — rename server tag to cain-30b when ready
];

export const TERRAFORGE_VENDOR = 'terratech';
export const TERRAFORGE_FAMILY = 'terraforge';

// --- Manager interface (RPC between frontend and backend) ---

export const TerraForgeLanguageModelsManager = Symbol('TerraForgeLanguageModelsManager');
export const TERRAFORGE_LANGUAGE_MODELS_MANAGER_PATH = '/services/terraforge-language-models-manager';

export interface TerraForgeLanguageModelsManager {
    createOrUpdateLanguageModels(host: string): Promise<void>;
}
