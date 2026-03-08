// ============================================================================
// Gixsis Proxy — Standalone Logger
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Replaces vscode.OutputChannel with a pure Node.js logger.
// Writes to console + optional log file. No VS Code dependency.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

export interface Logger {
  appendLine(msg: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
}

/** Console + file logger that replaces vscode.OutputChannel */
export class ProxyLogger implements Logger {
  private logStream: fs.WriteStream | null = null;

  constructor(name: string, logDir?: string) {

    if (logDir) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const logFile = path.join(logDir, `${name.toLowerCase().replace(/\s+/g, '-')}_${dateStamp}.log`);
        this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
      } catch {
        // Fall back to console-only if log dir creation fails
      }
    }
  }

  appendLine(msg: string): void {
    const timestamped = `[${new Date().toISOString()}] ${msg}`;
    console.log(timestamped);
    if (this.logStream) {
      this.logStream.write(timestamped + '\n');
    }
  }

  clear(): void {
    // No-op for console; file logging is append-only by design
  }

  show(_preserveFocus?: boolean): void {
    // No-op — standalone mode has no UI panel to show
  }

  dispose(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}
