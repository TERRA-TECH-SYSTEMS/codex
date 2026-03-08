// ============================================================================
// CodeEX v5 — Mentor Governance Service
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// The "Immigration Authority" — manages Work Visas for foreign AI agents.
// Issues, monitors, suspends, revokes visas. Captures training data.
// SOP Reference: TTS-SOP-WORKVISA-001
// ============================================================================

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';

// ---------------------------------------------------------------------------
// Work Visa Types
// ---------------------------------------------------------------------------

export type VisaStatus = 'active' | 'suspended' | 'revoked';
export type ExpirationPolicy = 'parity-based' | 'time-limited' | 'permanent';

export interface WorkVisa {
    /** Badge in AGXT format with ◇ symbol */
    badge: string;
    /** Visa number in WV-[ORIGIN]-[YEAR]-[SEQ] format */
    visaNumber: string;
    /** CodeEX job title */
    title: string;
    /** Source system and specific agent/model name */
    origin: string;
    /** AGXT badge of supervising sovereign ageixt */
    supervisorBadge: string;
    /** Current visa status: ◇ active, ◆ suspended, ◈ revoked */
    status: VisaStatus;
    /** Date visa was issued */
    issuedDate: string;
    /** How this visa expires */
    expirationPolicy: ExpirationPolicy;
    /** For parity-based: confidence threshold (0-100) */
    parityThreshold?: number;
    /** For time-limited: expiration date */
    expirationDate?: string;
    /** What the agent CAN access */
    accessBoundaries: string[];
    /** What the agent CANNOT access */
    restrictions: string[];
    /** Whether the kill switch is enabled */
    killSwitchEnabled: boolean;
    /** Rate limit: max calls per session */
    rateLimitPerSession: number;
    /** Running count of interactions */
    interactionCount: number;
    /** Current parity score (0-100) */
    parityScore: number;
    /** Count of interactions in current session */
    sessionCallCount: number;
}

export interface TrainingCapture {
    visaNumber: string;
    badge: string;
    timestamp: string;
    instruction: string;
    input: string;
    output: string;
}

export interface VisaStatusChangeEvent {
    badge: string;
    previousStatus: VisaStatus;
    newStatus: VisaStatus;
    reason: string;
}

// ---------------------------------------------------------------------------
// Status symbol mapping
// ---------------------------------------------------------------------------

const STATUS_SYMBOLS: Record<VisaStatus, string> = {
    active: '◇',
    suspended: '◆',
    revoked: '◈',
};

// ---------------------------------------------------------------------------
// MentorGovernanceService
// ---------------------------------------------------------------------------

@injectable()
export class MentorGovernanceService {

    private readonly visas = new Map<string, WorkVisa>();
    private readonly trainingLog: TrainingCapture[] = [];

    private readonly onVisaStatusChangedEmitter = new Emitter<VisaStatusChangeEvent>();
    readonly onVisaStatusChanged: Event<VisaStatusChangeEvent> = this.onVisaStatusChangedEmitter.event;

    constructor() {
        this.registerDefaultVisas();
    }

    // -----------------------------------------------------------------------
    // Visa Management
    // -----------------------------------------------------------------------

    /** Issue a new work visa */
    issueVisa(visa: WorkVisa): void {
        if (this.visas.has(visa.badge)) {
            throw new Error(`Visa already exists for badge ${visa.badge}`);
        }
        this.visas.set(visa.badge, { ...visa });
    }

    /** Get a visa by badge */
    getVisa(badge: string): WorkVisa | undefined {
        return this.visas.get(badge);
    }

    /** Get all visas */
    getAllVisas(): WorkVisa[] {
        return Array.from(this.visas.values());
    }

    /** Get visas by status */
    getVisasByStatus(status: VisaStatus): WorkVisa[] {
        return this.getAllVisas().filter(v => v.status === status);
    }

    /** Get the status symbol for a visa */
    getStatusSymbol(badge: string): string {
        const visa = this.visas.get(badge);
        return visa ? STATUS_SYMBOLS[visa.status] : '?';
    }

    // -----------------------------------------------------------------------
    // Access Control
    // -----------------------------------------------------------------------

    /** Check if a mentor is allowed to proceed */
    checkAccess(badge: string): { allowed: boolean; reason?: string } {
        const visa = this.visas.get(badge);
        if (!visa) {
            return { allowed: false, reason: 'No valid work visa found' };
        }

        if (visa.status === 'revoked') {
            return { allowed: false, reason: `Visa ${visa.visaNumber} has been permanently revoked ◈` };
        }

        if (visa.status === 'suspended') {
            return { allowed: false, reason: `Visa ${visa.visaNumber} is suspended ◆` };
        }

        // Rate limit check
        if (visa.sessionCallCount >= visa.rateLimitPerSession) {
            return { allowed: false, reason: `Rate limit exceeded (${visa.rateLimitPerSession} calls/session)` };
        }

        // Time-limited expiration check
        if (visa.expirationPolicy === 'time-limited' && visa.expirationDate) {
            if (new Date() > new Date(visa.expirationDate)) {
                this.suspendVisa(badge, 'Time-limited visa expired');
                return { allowed: false, reason: `Visa ${visa.visaNumber} expired on ${visa.expirationDate}` };
            }
        }

        // Parity-based expiration check
        if (visa.expirationPolicy === 'parity-based' && visa.parityThreshold) {
            if (visa.parityScore >= visa.parityThreshold) {
                this.revokeVisa(badge, `Parity threshold reached (${visa.parityScore}% >= ${visa.parityThreshold}%)`);
                return { allowed: false, reason: `Parity achieved — visa auto-expired` };
            }
        }

        return { allowed: true };
    }

    // -----------------------------------------------------------------------
    // Kill Switch & Status Changes
    // -----------------------------------------------------------------------

    /** Instantly suspend a visa (kill switch) */
    suspendVisa(badge: string, reason: string): void {
        const visa = this.visas.get(badge);
        if (!visa || visa.status === 'revoked') {
            return;
        }
        const prev = visa.status;
        visa.status = 'suspended';
        this.onVisaStatusChangedEmitter.fire({
            badge,
            previousStatus: prev,
            newStatus: 'suspended',
            reason,
        });
    }

    /** Permanently revoke a visa — irreversible */
    revokeVisa(badge: string, reason: string): void {
        const visa = this.visas.get(badge);
        if (!visa) {
            return;
        }
        const prev = visa.status;
        visa.status = 'revoked';
        this.onVisaStatusChangedEmitter.fire({
            badge,
            previousStatus: prev,
            newStatus: 'revoked',
            reason,
        });
    }

    /** Reactivate a suspended visa (NOT revoked — revocation is permanent) */
    reactivateVisa(badge: string, reason: string): void {
        const visa = this.visas.get(badge);
        if (!visa || visa.status !== 'suspended') {
            return;
        }
        visa.status = 'active';
        this.onVisaStatusChangedEmitter.fire({
            badge,
            previousStatus: 'suspended',
            newStatus: 'active',
            reason,
        });
    }

    /** Kill switch — instant suspension */
    killSwitch(badge: string): void {
        const visa = this.visas.get(badge);
        if (visa && visa.killSwitchEnabled) {
            this.suspendVisa(badge, 'Kill switch activated');
        }
    }

    /** Kill all — suspend every active visa */
    killAll(): void {
        for (const visa of this.visas.values()) {
            if (visa.status === 'active' && visa.killSwitchEnabled) {
                this.suspendVisa(visa.badge, 'Global kill switch activated');
            }
        }
    }

    // -----------------------------------------------------------------------
    // Training Data Capture
    // -----------------------------------------------------------------------

    /** Record a mentor interaction for training */
    captureInteraction(badge: string, instruction: string, input: string, output: string): void {
        const visa = this.visas.get(badge);
        if (!visa) {
            return;
        }

        visa.interactionCount++;
        visa.sessionCallCount++;

        const capture: TrainingCapture = {
            visaNumber: visa.visaNumber,
            badge,
            timestamp: new Date().toISOString(),
            instruction,
            input,
            output,
        };

        this.trainingLog.push(capture);
    }

    /** Get all captured training data */
    getTrainingLog(): TrainingCapture[] {
        return [...this.trainingLog];
    }

    /** Get training data for a specific mentor */
    getTrainingLogForMentor(badge: string): TrainingCapture[] {
        return this.trainingLog.filter(c => c.badge === badge);
    }

    /** Export training data as JSONL string */
    exportTrainingJSONL(badge?: string): string {
        const entries = badge ? this.getTrainingLogForMentor(badge) : this.trainingLog;
        return entries.map(e => JSON.stringify({
            instruction: e.instruction,
            input: e.input,
            output: e.output,
        })).join('\n');
    }

    /** Update parity score for a mentor */
    updateParityScore(badge: string, score: number): void {
        const visa = this.visas.get(badge);
        if (visa) {
            visa.parityScore = Math.min(100, Math.max(0, score));
        }
    }

    /** Reset session call count (call at session start) */
    resetSessionCounts(): void {
        for (const visa of this.visas.values()) {
            visa.sessionCallCount = 0;
        }
    }

    // -----------------------------------------------------------------------
    // Default Visa Registration — Theia AI Mentor Agents
    // -----------------------------------------------------------------------

    private registerDefaultVisas(): void {
        this.issueVisa({
            badge: 'AGXT-2.900.001◇',
            visaNumber: 'WV-TH-2026-001',
            title: 'CodeEX Task Orchestration Mentor',
            origin: 'Theia AI — Orchestrator Agent (@theia/ai-ide-agents)',
            supervisorBadge: 'AGXT-2.0.011',
            status: 'active',
            issuedDate: '2026-03-04',
            expirationPolicy: 'parity-based',
            parityThreshold: 95,
            accessBoundaries: [
                'Read workspace file tree',
                'Read open editor state',
                'Delegate tasks to agents',
                'Access ChatAgentService',
                'Read terminal output',
            ],
            restrictions: [
                'No file writes',
                'No command execution',
                'No credential access',
                'No settings modification',
                'No network access beyond localhost',
            ],
            killSwitchEnabled: true,
            rateLimitPerSession: 100,
            interactionCount: 0,
            parityScore: 0,
            sessionCallCount: 0,
        });

        this.issueVisa({
            badge: 'AGXT-2.900.002◇',
            visaNumber: 'WV-TH-2026-002',
            title: 'CodeEX Command Execution Mentor',
            origin: 'Theia AI — Command Chat Agent (@theia/ai-ide-agents)',
            supervisorBadge: 'AGXT-2.0.011',
            status: 'active',
            issuedDate: '2026-03-04',
            expirationPolicy: 'parity-based',
            parityThreshold: 95,
            accessBoundaries: [
                'Read command registry',
                'Read keybinding map',
                'Read menu structure',
                'Query command enablement',
            ],
            restrictions: [
                'No direct command execution',
                'No credential access',
                'No settings modification',
                'No file content access',
                'No network access',
            ],
            killSwitchEnabled: true,
            rateLimitPerSession: 100,
            interactionCount: 0,
            parityScore: 0,
            sessionCallCount: 0,
        });

        this.issueVisa({
            badge: 'AGXT-2.900.003◇',
            visaNumber: 'WV-TH-2026-003',
            title: 'CodeEX Workspace Context Mentor',
            origin: 'Theia AI — Workspace Agent (@theia/ai-ide-agents)',
            supervisorBadge: 'AGXT-2.0.011',
            status: 'active',
            issuedDate: '2026-03-04',
            expirationPolicy: 'parity-based',
            parityThreshold: 90,
            accessBoundaries: [
                'Read file tree structure',
                'Read non-restricted file contents',
                'Access symbol index',
                'Execute workspace search',
                'Read project config files',
            ],
            restrictions: [
                'No .env file access',
                'No credential access',
                'No auth token access',
                'No file writes',
                'No network access',
                'No archived files (00-sops/archives/)',
            ],
            killSwitchEnabled: true,
            rateLimitPerSession: 150,
            interactionCount: 0,
            parityScore: 0,
            sessionCallCount: 0,
        });
    }
}
