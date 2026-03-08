// ============================================================================
// CodeEX v5 — Gixsis Proxy Service Interface (RPC)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Shared interface between backend (implements) and frontend (calls via RPC).
// The backend runs SovereignProxy + IdentityManager + TrainingCaptureWriter.
// The frontend displays monitoring data and sends commands.
// ============================================================================

export const GixsisProxyService = Symbol('GixsisProxyService');
export const GIXSIS_PROXY_SERVICE_PATH = '/services/gixsis-proxy';

export interface ProxyStatus {
    running: boolean;
    port: number;
    routingMode: string;
    requests_total: number;
    requests_mentor: number;
    requests_sovereign: number;
    requests_dual: number;
    tokens_input_total: number;
    tokens_output_total: number;
    estimated_context_usage_pct: number;
    training_pairs_captured: number;
    start_time: string;
    last_request_time: string | null;
    connect_tunnels_total: number;
    connect_tunnels_intercepted: number;
    connect_tunnels_passthrough: number;
    connect_tunnels_swallowed: number;
}

export interface TrainingStatus {
    enabled: boolean;
    sft_pairs_written: number;
    dpo_pairs_written: number;
    total_pairs_written: number;
    bytes_written: number;
    output_file: string;
    session_start: string;
    last_write: string | null;
}

export interface IdentityStatus {
    badge: string;
    name: string;
    tier: number;
    domain: string;
    skills: string[];
    continuationCurrent: number;
    continuationNext: number;
    taskCounter: number;
    lastHandoffPath: string;
    sessionDate: string;
    activeDirectives: string[];
}

export interface ConfidenceEntry {
    domain: string;
    score: number;
    tasks: number;
    trend: string;
}

export interface TrainingInteraction {
    userMessage: string;
    assistantResponse: string;
    model: string;
    inputTokensEstimate: number;
    outputTokensEstimate: number;
}

export interface GixsisProxyService {
    getProxyStatus(): Promise<ProxyStatus>;
    getTrainingStatus(): Promise<TrainingStatus>;
    getIdentityStatus(): Promise<IdentityStatus>;
    getConfidenceRegistry(): Promise<ConfidenceEntry[]>;
    startProxy(): Promise<void>;
    stopProxy(): Promise<void>;
    restartProxy(): Promise<void>;
    syncContext(): Promise<void>;
    writeContinuationCounter(): Promise<boolean>;
    captureTrainingInteraction(interaction: TrainingInteraction): Promise<void>;
}
