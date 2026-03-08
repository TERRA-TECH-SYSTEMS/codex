// ============================================================================
// Gixsis Proxy — Training Data Capture (Standalone)
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Decoupled from VS Code. Uses Logger interface instead of vscode.OutputChannel.
// No vscode.* imports.
//
// Captures every Mentor response as JSONL training pairs for the nootIQ
// pipeline. Every dollar spent on Anthropic generates training data that
// makes the sovereign model better.
//
// SOP Reference: TTS-SOP-TRAINCONV-001
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from './logger';
import type { SovereignProxy } from './sovereign-proxy';
import type { IdentityManager } from './identity-manager-standalone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SftPair {
  instruction: string;
  input: string;
  output: string;
  metadata: TrainingMetadata;
}

export interface DpoPair {
  prompt: string;
  chosen: string;
  rejected: string;
  metadata: TrainingMetadata;
}

export interface TrainingMetadata {
  source: 'mentor-capture' | 'dual-execution' | 'principal-correction';
  ageixt_badge: string;
  domain: string;
  confidence_at_generation: number;
  timestamp: string;
  model_mentor: string;
  model_sovereign?: string;
  input_tokens: number;
  output_tokens: number;
}

export interface CaptureStats {
  sft_pairs_written: number;
  dpo_pairs_written: number;
  total_pairs_written: number;
  output_file: string;
  session_start: string;
  last_write: string | null;
  bytes_written: number;
}

// ---------------------------------------------------------------------------
// Correction Detection
// ---------------------------------------------------------------------------

const CORRECTION_SIGNALS = [
  'fix this', 'that\'s wrong', 'that is wrong', 'incorrect', 'not correct',
  'still doing', 'still referring', 'stop doing', 'don\'t do that', 'do not do that',
  'i said', 'i told you', 'i already said', 'i already told',
  'wrong', 'no,', 'no.', 'that\'s not', 'that is not',
  'sop violation', 'violation', 'fix this sop', 'not following',
  'you\'re not', 'you are not', 'you should not', 'you shouldn\'t',
  'must not', 'never do', 'always do', 'remember to', 'i need you to',
  'try again', 'redo this', 'do it again', 'start over', 'let me clarify',
] as const;

interface PreviousExchange {
  instruction: string;
  response: string;
  model: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Training Capture Writer (Standalone)
// ---------------------------------------------------------------------------

export class TrainingCaptureWriter {
  private outputDir: string;
  private sftFile: string;
  private dpoFile: string;
  private sftStream: fs.WriteStream | null = null;
  private dpoStream: fs.WriteStream | null = null;
  private stats: CaptureStats;
  private identityManager: IdentityManager;
  private logger: Logger;
  private previousExchange: PreviousExchange | null = null;

  constructor(
    outputDir: string,
    identityManager: IdentityManager,
    logger: Logger,
  ) {
    this.outputDir = outputDir;
    this.identityManager = identityManager;
    this.logger = logger;

    const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const badge = identityManager.getIdentity().badge.replace(/\./g, '_');
    this.sftFile = path.join(
      outputDir,
      `PROXY_CAPTURE_SFT_${badge}_${dateStamp}.jsonl`,
    );
    this.dpoFile = path.join(
      outputDir,
      `PROXY_CAPTURE_DPO_${badge}_${dateStamp}.jsonl`,
    );

    this.stats = {
      sft_pairs_written: 0,
      dpo_pairs_written: 0,
      total_pairs_written: 0,
      output_file: this.sftFile,
      session_start: new Date().toISOString(),
      last_write: null,
      bytes_written: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(proxy: SovereignProxy): Promise<void> {
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
    } catch (err: any) {
      this.log(`WARNING: Could not create output dir: ${err.message}`);
    }

    this.sftStream = fs.createWriteStream(this.sftFile, { flags: 'a' });
    this.dpoStream = fs.createWriteStream(this.dpoFile, { flags: 'a' });

    proxy.on('training-capture', (capture) => {
      this.handleCapture(capture);
    });

    this.log(`Training capture initialized: ${this.sftFile}`);
  }

  async close(): Promise<void> {
    if (this.sftStream) {
      this.sftStream.end();
      this.sftStream = null;
    }
    if (this.dpoStream) {
      this.dpoStream.end();
      this.dpoStream = null;
    }
    this.log(`Training capture closed. ${this.stats.total_pairs_written} pairs written.`);
  }

  getStats(): CaptureStats {
    return { ...this.stats };
  }

  // -------------------------------------------------------------------------
  // Capture handler
  // -------------------------------------------------------------------------

  private handleCapture(capture: any): void {
    const identity = this.identityManager.getIdentity();

    capture.ageixt_badge = identity.badge;
    capture.domain = identity.domain;

    const state = this.identityManager.getState();
    const domainConf = state.confidence.domains[identity.domain];
    capture.confidence = domainConf?.score ?? 0;

    const userMessages = capture.request.messages.filter(
      (m: any) => m.role === 'user',
    );
    const lastUserMessage = userMessages.length > 0
      ? userMessages[userMessages.length - 1].content
      : '';

    if (!capture.response.content || capture.response.content.trim() === '') {
      return;
    }

    if (lastUserMessage.length < 10) {
      return;
    }

    // Principal-correction DPO detection
    if (this.previousExchange && this.isCorrection(lastUserMessage)) {
      this.log(`CORRECTION DETECTED: "${lastUserMessage.substring(0, 80)}..." — generating DPO pair`);

      const originalPrompt = this.previousExchange.instruction;
      const chosen = capture.response.content;
      const rejected = this.previousExchange.response;

      this.writeDpoPairFromCorrection(
        originalPrompt,
        chosen,
        rejected,
        lastUserMessage,
        capture,
      );
    }

    if (capture.routing_decision === 'mentor') {
      this.writeSftPair(lastUserMessage, capture);
    } else if (capture.routing_decision === 'dual') {
      this.writeSftPair(lastUserMessage, capture);

      if (capture.sovereign_response?.content) {
        this.writeDpoPair(
          lastUserMessage,
          capture.response.content,
          capture.sovereign_response.content,
          capture.response.model || '',
          capture.sovereign_response.model || '',
        );
      }
    }

    this.previousExchange = {
      instruction: lastUserMessage,
      response: capture.response.content,
      model: capture.response.model || '',
      timestamp: capture.timestamp,
    };
  }

  private isCorrection(userMessage: string): boolean {
    const lower = userMessage.toLowerCase();

    for (const signal of CORRECTION_SIGNALS) {
      if (lower.includes(signal)) {
        return true;
      }
    }

    if (lower.length < 200) {
      if (/^(no[,.\s]|nope|wrong|stop|don't|do not|that's not|fix )/.test(lower)) {
        return true;
      }
    }

    return false;
  }

  private writeDpoPairFromCorrection(
    originalPrompt: string,
    chosen: string,
    rejected: string,
    correctionMessage: string,
    capture: any,
  ): void {
    if (!this.dpoStream) { return; }

    const identity = this.identityManager.getIdentity();
    const dpoState = this.identityManager.getState();
    const domainConf = dpoState.confidence.domains[identity.domain];

    const pair: DpoPair = {
      prompt: this.cleanForTraining(originalPrompt),
      chosen: this.cleanForTraining(chosen),
      rejected: this.cleanForTraining(rejected),
      metadata: {
        source: 'principal-correction',
        ageixt_badge: identity.badge,
        domain: identity.domain,
        confidence_at_generation: domainConf?.score ?? 0,
        timestamp: new Date().toISOString(),
        model_mentor: capture.response.model || '',
        model_sovereign: this.previousExchange?.model,
        input_tokens: capture.response.input_tokens || 0,
        output_tokens: capture.response.output_tokens || 0,
      },
    };

    const enriched = { ...pair, correction_signal: this.cleanForTraining(correctionMessage) };
    const line = JSON.stringify(enriched) + '\n';
    this.dpoStream.write(line);
    this.stats.dpo_pairs_written++;
    this.stats.total_pairs_written++;
    this.stats.bytes_written += Buffer.byteLength(line);
    this.stats.last_write = new Date().toISOString();

    this.log(`DPO pair written (principal-correction): prompt=${originalPrompt.substring(0, 50)}...`);
  }

  // -------------------------------------------------------------------------
  // Writers
  // -------------------------------------------------------------------------

  private writeSftPair(instruction: string, capture: any): void {
    if (!this.sftStream) { return; }

    const pair: SftPair = {
      instruction: this.cleanForTraining(instruction),
      input: '',
      output: this.cleanForTraining(capture.response.content),
      metadata: {
        source: 'mentor-capture',
        ageixt_badge: capture.ageixt_badge,
        domain: capture.domain,
        confidence_at_generation: capture.confidence,
        timestamp: capture.timestamp,
        model_mentor: capture.response.model,
        input_tokens: capture.response.input_tokens,
        output_tokens: capture.response.output_tokens,
      },
    };

    const line = JSON.stringify(pair) + '\n';
    this.sftStream.write(line);
    this.stats.sft_pairs_written++;
    this.stats.total_pairs_written++;
    this.stats.bytes_written += Buffer.byteLength(line);
    this.stats.last_write = new Date().toISOString();
  }

  /** Write SFT pair from native chat path (TerraForge direct, not via proxy) */
  writeSftPairDirect(
    instruction: string,
    output: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    if (!this.sftStream) { return; }

    const identity = this.identityManager.getIdentity();
    const state = this.identityManager.getState();
    const domainConf = state.confidence.domains[identity.domain];

    const pair: SftPair = {
      instruction: this.cleanForTraining(instruction),
      input: '',
      output: this.cleanForTraining(output),
      metadata: {
        source: 'mentor-capture',
        ageixt_badge: identity.badge,
        domain: identity.domain,
        confidence_at_generation: domainConf?.score ?? 0,
        timestamp: new Date().toISOString(),
        model_mentor: model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    };

    const line = JSON.stringify(pair) + '\n';
    this.sftStream.write(line);
    this.stats.sft_pairs_written++;
    this.stats.total_pairs_written++;
    this.stats.bytes_written += Buffer.byteLength(line);
    this.stats.last_write = new Date().toISOString();

    this.log(`SFT pair written (native-chat): ${instruction.substring(0, 50)}...`);
  }

  writeDpoPair(
    prompt: string,
    chosen: string,
    rejected: string,
    mentorModel: string,
    sovereignModel: string,
  ): void {
    if (!this.dpoStream) { return; }

    const identity = this.identityManager.getIdentity();
    const state = this.identityManager.getState();
    const domainConf = state.confidence.domains[identity.domain];

    const pair: DpoPair = {
      prompt: this.cleanForTraining(prompt),
      chosen: this.cleanForTraining(chosen),
      rejected: this.cleanForTraining(rejected),
      metadata: {
        source: 'dual-execution',
        ageixt_badge: identity.badge,
        domain: identity.domain,
        confidence_at_generation: domainConf?.score ?? 0,
        timestamp: new Date().toISOString(),
        model_mentor: mentorModel,
        model_sovereign: sovereignModel,
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    const line = JSON.stringify(pair) + '\n';
    this.dpoStream.write(line);
    this.stats.dpo_pairs_written++;
    this.stats.total_pairs_written++;
    this.stats.bytes_written += Buffer.byteLength(line);
    this.stats.last_write = new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private cleanForTraining(text: string): string {
    let cleaned = text;

    const l1Start = '## SOVEREIGN OPERATING CONTEXT';
    const l1End = '--- END FOUNDATIONAL CONTEXT ---';
    const l1StartIdx = cleaned.indexOf(l1Start);
    const l1EndIdx = cleaned.indexOf(l1End);
    if (l1StartIdx !== -1 && l1EndIdx !== -1) {
      cleaned = cleaned.slice(0, l1StartIdx)
        + cleaned.slice(l1EndIdx + l1End.length);
    }

    const l2Start = '## LAYER 2: AGEIXT-SPECIFIC CONTEXT';
    const l2End = '--- END LAYER 2 CONTEXT ---';
    const l2StartIdx = cleaned.indexOf(l2Start);
    const l2EndIdx = cleaned.indexOf(l2End);
    if (l2StartIdx !== -1 && l2EndIdx !== -1) {
      cleaned = cleaned.slice(0, l2StartIdx)
        + cleaned.slice(l2EndIdx + l2End.length);
    }

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  private log(msg: string): void {
    this.logger.appendLine(
      `[training-capture] ${msg}`,
    );
  }
}
