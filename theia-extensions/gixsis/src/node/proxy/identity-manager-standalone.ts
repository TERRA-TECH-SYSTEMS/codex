// ============================================================================
// Gixsis Proxy — Identity Manager (Standalone)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// LAYER 2: AGEIXT-SPECIFIC OPERATING CONTEXT
//
// Decoupled from VS Code. Uses StateStore (file-based JSON) for persistence
// and Logger interface for output. No vscode.* imports.
//
// On every API request passing through the proxy, this module prepends
// Layer 1 (FOUNDATIONAL_CONTEXT from sovereign-proxy.ts) PLUS Layer 2
// (ageixt-specific identity, directives, session state) to the system
// message. The ageixt NEVER wakes up empty.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from './logger';
import type { StateStore } from './state-store';
import {
  type AnthropicRequest,
  type SovereignProxy,
  FOUNDATIONAL_CONTEXT,
} from './sovereign-proxy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ageixt identity stored in state */
export interface AgeixtIdentity {
  badge: string;
  name: string;
  tier: number;
  domain: string;
  skills: string[];
  identityFilePath: string;
}

/** Session state persisted across compaction */
export interface SessionState {
  continuationCurrent: number;
  continuationNext: number;
  taskCounter: number;
  taskLog: string[];
  lastHandoffPath: string;
  sessionDate: string;
  activeDirectives: string[];
}

/** Confidence scores per domain */
export interface ConfidenceRegistry {
  domains: Record<string, {
    score: number;
    tasks: number;
    trend: 'stable' | 'improving' | 'learning' | 'not my domain';
  }>;
}

/** Full persistent state structure */
export interface PersistentState {
  identity: AgeixtIdentity;
  session: SessionState;
  confidence: ConfidenceRegistry;
  lastUpdated: string;
  workspaceRoot: string;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STATE_KEY = 'gixsisProxy.persistentState';

// ---------------------------------------------------------------------------
// Identity Manager (Standalone)
// ---------------------------------------------------------------------------

export class IdentityManager {
  private store: StateStore;
  private state: PersistentState;
  private workspaceRoot: string;
  private logger: Logger;
  private enrichedContextCache: string | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    store: StateStore,
    workspaceRoot: string,
    logger: Logger,
  ) {
    this.store = store;
    this.workspaceRoot = workspaceRoot;
    this.logger = logger;

    // Load persisted state or initialize defaults
    const saved = this.store.get<PersistentState>(STATE_KEY);
    if (saved) {
      this.state = saved;
      this.log(`Loaded persisted state: ${saved.identity.badge} (${saved.identity.name}), continuation=${saved.session.continuationCurrent}`);
    } else {
      this.state = this.createDefaultState();
      this.log('No persisted state found — initialized defaults');
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  async initialize(proxy: SovereignProxy): Promise<void> {
    await this.buildEnrichedContext();

    proxy.registerSystemMessageTransform((req: AnthropicRequest) => {
      return this.injectFullContext(req);
    });

    this.log('Registered system message transform with proxy');

    await this.syncFromDisk();

    // Periodic re-sync every 60 seconds
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncFromDisk();
      } catch (err: any) {
        this.log(`WARNING: Periodic sync failed: ${err.message}`);
      }
    }, 60_000);
    this.log('Periodic disk re-sync started (60s interval)');
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.log('Periodic disk re-sync stopped');
    }
  }

  // -------------------------------------------------------------------------
  // Context injection — THE CORE FUNCTION
  // -------------------------------------------------------------------------

  private injectFullContext(req: AnthropicRequest): AnthropicRequest {
    const existingSystem = typeof req.system === 'string'
      ? req.system
      : Array.isArray(req.system)
        ? req.system.map((s: any) => s.text || '').join('\n')
        : '';

    const layer2 = this.buildLayer2Context();
    const fullContext = FOUNDATIONAL_CONTEXT
      + '\n\n'
      + layer2
      + '\n\n'
      + existingSystem;

    return {
      ...req,
      system: fullContext,
    };
  }

  private buildLayer2Context(): string {
    const { identity, session, confidence } = this.state;

    const directivesBlock = session.activeDirectives.length > 0
      ? session.activeDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')
      : 'No active directives loaded. Read last handoff for current directives.';

    const confEntries = Object.entries(confidence.domains);
    const confBlock = confEntries.length > 0
      ? confEntries.map(([domain, data]) =>
          `- ${domain}: ${data.score.toFixed(2)} (${data.tasks} tasks, ${data.trend})`
        ).join('\n')
      : 'No confidence data loaded.';

    const taskLogBlock = session.taskLog.length > 0
      ? session.taskLog.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : 'No tasks completed this session.';

    const enriched = this.enrichedContextCache || '';

    return `
## LAYER 2: AGEIXT-SPECIFIC CONTEXT
## Injected by Gixsis Proxy Identity Manager

### ACTIVE AGEIXT IDENTITY
- **Badge:** ${identity.badge}
- **Name:** ${identity.name}
- **Tier:** ${identity.tier} (${this.tierLabel(identity.tier)})
- **Domain:** ${identity.domain}
- **Skills:** ${identity.skills.join(', ') || 'Not loaded'}
- **Identity File:** ${identity.identityFilePath}

### SESSION STATE
- **Continuation Counter:** Current=${session.continuationCurrent}, Next=${session.continuationNext}
- **Task Counter:** ${session.taskCounter} / 10 (mandatory handoff at 10)
- **Last Handoff:** ${session.lastHandoffPath}
- **Session Date:** ${session.sessionDate}

### ACTIVE DIRECTIVES
${directivesBlock}

### CONFIDENCE REGISTRY
${confBlock}

### TASKS COMPLETED THIS SESSION
${taskLogBlock}

${enriched}

--- END LAYER 2 CONTEXT ---
`.trim();
  }

  // -------------------------------------------------------------------------
  // Enriched context from disk
  // -------------------------------------------------------------------------

  private async buildEnrichedContext(): Promise<void> {
    const sections: string[] = [];

    if (this.state.identity.identityFilePath) {
      const fullPath = this.resolveRelativePath(this.state.identity.identityFilePath);
      const content = this.safeReadFile(fullPath);
      if (content) {
        sections.push('### AGEIXT IDENTITY FILE (from disk)\n' + content);
      }
    }

    const counterPath = this.resolveRelativePath(
      '01-ageixtic/01-sessions/CONTINUATION_COUNTER.md',
    );
    const counterContent = this.safeReadFile(counterPath);
    if (counterContent) {
      const match = counterContent.match(
        /## CURRENT STATE[\s\S]*?(?=## HISTORY LOG|$)/,
      );
      if (match) {
        sections.push('### CONTINUATION COUNTER (from disk)\n' + match[0].trim());
      }
    }

    if (this.state.session.lastHandoffPath) {
      const handoffFullPath = this.resolveRelativePath(this.state.session.lastHandoffPath);
      const handoffContent = this.safeReadFile(handoffFullPath);
      if (handoffContent) {
        const lines = handoffContent.split('\n').slice(0, 80);
        sections.push(
          '### LAST HANDOFF HEADER (from disk)\n' + lines.join('\n'),
        );
      }
    }

    this.enrichedContextCache = sections.length > 0
      ? '### ENRICHED CONTEXT (read from disk at proxy startup)\n\n'
        + sections.join('\n\n')
      : '';

    this.log(`Built enriched context: ${sections.length} sections loaded from disk`);
  }

  // -------------------------------------------------------------------------
  // Disk sync
  // -------------------------------------------------------------------------

  async syncFromDisk(): Promise<void> {
    this.log(`syncFromDisk: workspaceRoot=${this.workspaceRoot}`);

    const counterPath = this.resolveRelativePath(
      '01-ageixtic/01-sessions/CONTINUATION_COUNTER.md',
    );
    this.log(`syncFromDisk: counterPath=${counterPath}`);
    const counterContent = this.safeReadFile(counterPath);
    if (counterContent) {
      const currentMatch = counterContent.match(
        /\*\*Current Continuation\*\*\s*\|\s*\*\*(\d+)\*\*/,
      );
      const nextMatch = counterContent.match(
        /\*\*Next Continuation\*\*\s*\|\s*\*\*(\d+)\*\*/,
      );
      const handoffMatch = counterContent.match(
        /\*\*Last Handoff File\*\*\s*\|\s*`([^`]+)`/,
      );

      if (currentMatch) {
        this.state.session.continuationCurrent = parseInt(currentMatch[1], 10);
      }
      if (nextMatch) {
        this.state.session.continuationNext = parseInt(nextMatch[1], 10);
      }
      if (handoffMatch) {
        this.state.session.lastHandoffPath = handoffMatch[1];
      }

      this.log(`Synced from CONTINUATION_COUNTER.md: current=${this.state.session.continuationCurrent}, next=${this.state.session.continuationNext}`);
    }

    const compliancePath = path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      '.claude/.compliance-state.json',
    );
    const complianceContent = this.safeReadFile(compliancePath);
    if (complianceContent) {
      try {
        const compliance = JSON.parse(complianceContent);
        this.state.session.taskCounter =
          compliance.task_counter?.current_count ?? 0;
        this.state.session.taskLog =
          compliance.task_counter?.tasks_completed_this_session ?? [];
        this.log(`Synced from .compliance-state.json: taskCounter=${this.state.session.taskCounter}`);
      } catch {
        this.log('WARNING: Failed to parse .compliance-state.json');
      }
    }

    await this.persist();
  }

  // -------------------------------------------------------------------------
  // State mutation methods
  // -------------------------------------------------------------------------

  async setActiveAgeixt(identity: AgeixtIdentity): Promise<void> {
    this.state.identity = identity;
    this.state.lastUpdated = new Date().toISOString();
    await this.buildEnrichedContext();
    await this.persist();
    this.log(`Active ageixt set: ${identity.badge} (${identity.name})`);
  }

  async incrementTaskCounter(taskDescription: string): Promise<number> {
    this.state.session.taskCounter++;
    this.state.session.taskLog.push(taskDescription);
    await this.persist();
    return this.state.session.taskCounter;
  }

  async resetTaskCounter(): Promise<void> {
    this.state.session.taskCounter = 0;
    this.state.session.taskLog = [];
    await this.persist();
  }

  async updateContinuation(current: number, next: number): Promise<void> {
    this.state.session.continuationCurrent = current;
    this.state.session.continuationNext = next;
    await this.persist();
  }

  async setDirectives(directives: string[]): Promise<void> {
    this.state.session.activeDirectives = directives;
    await this.persist();
  }

  async updateConfidence(
    domain: string,
    score: number,
    tasksDelta: number,
  ): Promise<void> {
    if (!this.state.confidence.domains[domain]) {
      this.state.confidence.domains[domain] = {
        score: 0,
        tasks: 0,
        trend: 'learning',
      };
    }
    const entry = this.state.confidence.domains[domain];
    entry.score = Math.max(0, Math.min(1, score));
    entry.tasks += tasksDelta;
    entry.trend = score >= 0.85 ? 'stable'
      : score >= 0.50 ? 'improving'
      : 'learning';
    await this.persist();
  }

  getState(): Readonly<PersistentState> {
    return { ...this.state };
  }

  getIdentity(): Readonly<AgeixtIdentity> {
    return { ...this.state.identity };
  }

  isHandoffRequired(): boolean {
    return this.state.session.taskCounter >= 10;
  }

  /** Write continuation counter back to disk (update CONTINUATION_COUNTER.md) */
  async writeContinuationToDisk(): Promise<boolean> {
    const counterPath = this.resolveRelativePath(
      '01-ageixtic/01-sessions/CONTINUATION_COUNTER.md',
    );

    const content = this.safeReadFile(counterPath);
    if (!content) {
      this.log('WARNING: Cannot write continuation counter — file not found');
      return false;
    }

    try {
      let updated = content;

      updated = updated.replace(
        /(\*\*Current Continuation\*\*\s*\|\s*\*\*)\d+(\*\*)/,
        `$1${this.state.session.continuationCurrent}$2`,
      );

      updated = updated.replace(
        /(\*\*Next Continuation\*\*\s*\|\s*\*\*)\d+(\*\*)/,
        `$1${this.state.session.continuationNext}$2`,
      );

      if (this.state.session.lastHandoffPath) {
        updated = updated.replace(
          /(\*\*Last Handoff File\*\*\s*\|\s*)`[^`]+`/,
          `$1\`${this.state.session.lastHandoffPath}\``,
        );
      }

      if (updated !== content) {
        fs.writeFileSync(counterPath, updated, 'utf-8');
        this.log(`Wrote continuation counter to disk: current=${this.state.session.continuationCurrent}, next=${this.state.session.continuationNext}`);
        return true;
      }

      this.log('Continuation counter unchanged — no write needed');
      return true;
    } catch (err: any) {
      this.log(`WARNING: Failed to write continuation counter: ${err.message}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private async persist(): Promise<void> {
    this.state.lastUpdated = new Date().toISOString();
    await this.store.update(STATE_KEY, this.state);
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private createDefaultState(): PersistentState {
    return {
      identity: {
        badge: 'AGXT-0.0.001',
        name: 'Gixsis',
        tier: 0,
        domain: 'all',
        skills: [],
        identityFilePath: path.join(
          process.env.USERPROFILE || process.env.HOME || '',
          '.claude', 'GIXSIS_IDENTITY.md',
        ),
      },
      session: {
        continuationCurrent: 0,
        continuationNext: 1,
        taskCounter: 0,
        taskLog: [],
        lastHandoffPath: '',
        sessionDate: new Date().toISOString().split('T')[0],
        activeDirectives: [],
      },
      confidence: { domains: {} },
      lastUpdated: new Date().toISOString(),
      workspaceRoot: this.workspaceRoot,
    };
  }

  private resolveRelativePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }

    const direct = path.join(this.workspaceRoot, relativePath);
    if (fs.existsSync(direct)) {
      return direct;
    }

    const ageixticPrefix = '01-ageixtic/';
    if (relativePath.startsWith(ageixticPrefix)) {
      const stripped = path.join(
        this.workspaceRoot,
        relativePath.slice(ageixticPrefix.length),
      );
      if (fs.existsSync(stripped)) {
        this.log(`Path resolved by stripping 01-ageixtic/ prefix: ${stripped}`);
        return stripped;
      }
    }

    // Strategy 3: Walk up multiple parent directories (up to 10 levels)
    let walkDir = this.workspaceRoot;
    for (let i = 1; i <= 10; i++) {
      walkDir = path.dirname(walkDir);
      if (walkDir === path.dirname(walkDir)) break; // reached root
      const candidate = path.join(walkDir, relativePath);
      if (fs.existsSync(candidate)) {
        this.log(`Path resolved by walking up ${i} level(s): ${candidate}`);
        return candidate;
      }
    }

    this.log(`WARNING: Could not resolve path: ${relativePath} (tried from ${this.workspaceRoot})`);
    return direct;
  }

  private safeReadFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      this.log(`Could not read: ${filePath}`);
      return null;
    }
  }

  private tierLabel(tier: number): string {
    switch (tier) {
      case 0: return 'Executive';
      case 1: return 'Management';
      case 2: return 'Specialist';
      case 3: return 'Operations';
      default: return 'Unknown';
    }
  }

  private log(msg: string): void {
    this.logger.appendLine(
      `[identity-manager] ${msg}`,
    );
  }
}
