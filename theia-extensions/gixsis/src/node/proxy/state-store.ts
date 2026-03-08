// ============================================================================
// Gixsis Proxy — File-Based State Store
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Replaces vscode.Memento (globalState) with a JSON file on disk.
// State persists across process restarts without needing VS Code.
//
// SAFEGUARD: State files are written ONLY to the proxy's own state
// directory (.gixsis-proxy/). Never writes to .vscode/, ~/.claude/,
// or any other external config location.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

/**
 * File-based key-value store that replaces vscode.Memento.
 * Same interface: get<T>(key, defaultValue) and update(key, value).
 */
export class StateStore {
  private stateDir: string;
  private stateFile: string;
  private data: Record<string, any> = {};

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    this.stateFile = path.join(stateDir, 'state.json');
    this.load();
  }

  /** Get a value from the store */
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (key in this.data) {
      return this.data[key] as T;
    }
    return defaultValue;
  }

  /** Update a value in the store and persist to disk */
  async update(key: string, value: any): Promise<void> {
    this.data[key] = value;
    this.save();
  }

  /** Load state from disk */
  private load(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch {
      // Corrupted state file — start fresh
      this.data = {};
    }
  }

  /** Save state to disk */
  private save(): void {
    try {
      fs.mkdirSync(this.stateDir, { recursive: true });
      // Write to temp file then rename — atomic write prevents corruption
      const tempFile = this.stateFile + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, this.stateFile);
    } catch {
      // State persistence failure is non-fatal — log but continue
      console.error(`[state-store] Failed to persist state to ${this.stateFile}`);
    }
  }
}
