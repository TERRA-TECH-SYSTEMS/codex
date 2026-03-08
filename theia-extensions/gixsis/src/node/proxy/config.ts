// ============================================================================
// Gixsis Proxy — Standalone Configuration
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Replaces vscode.workspace.getConfiguration with a pure Node.js config
// loader. Reads from a JSON config file + environment variables.
// No VS Code dependency.
//
// SAFEGUARD: This config loader ONLY reads. It NEVER writes to external
// config files (.vscode/settings.json, ~/.claude/settings.json, system
// env vars). The proxy owns its own config and nothing else.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

/** Full proxy configuration — all settings in one place */
export interface GixsisProxyConfig {
  // Proxy server
  enabled: boolean;
  port: number;

  // Anthropic upstream
  anthropicApiKey?: string;
  anthropicBaseUrl: string;
  anthropicVersion: string;

  // Sovereign endpoint
  sovereignEndpoint: string;

  // Ageixt identity
  ageixtBadge: string;
  ageixtName: string;

  // Training capture
  trainingCaptureEnabled: boolean;
  trainingOutputDir: string;

  // Context injection
  contextInjectionEnabled: boolean;

  // Routing
  routingMode: 'mentor-only' | 'passthrough-capture' | 'confidence-based' | 'sovereign-only';
  sovereignConfidenceThreshold: number;
  dualExecutionLower: number;
  dualExecutionUpper: number;

  // Compact protocol
  tokenWarningThreshold: number;

  // Paths
  workspaceRoot: string;
  certsDir: string;
  stateDir: string;  // Directory for persistent state (replaces vscode.globalState)
  logDir: string;    // Directory for log files
}

/** Default configuration values */
const DEFAULTS: GixsisProxyConfig = {
  enabled: true,
  port: 8787,
  anthropicBaseUrl: 'https://api.anthropic.com',
  anthropicVersion: '2023-06-01',
  sovereignEndpoint: 'http://216.158.238.162:11434',
  ageixtBadge: 'AGXT-0.0.001',
  ageixtName: 'Gixsis',
  trainingCaptureEnabled: true,
  trainingOutputDir: '',
  contextInjectionEnabled: true,
  routingMode: 'passthrough-capture',
  sovereignConfidenceThreshold: 0.85,
  dualExecutionLower: 0.5,
  dualExecutionUpper: 0.84,
  tokenWarningThreshold: 70,
  workspaceRoot: '',
  certsDir: '',
  stateDir: '',
  logDir: '',
};

/**
 * Load proxy configuration from (in order of precedence):
 * 1. Environment variables (GIXSIS_PROXY_*)
 * 2. Config file (gixsis-proxy.json)
 * 3. Defaults
 *
 * SAFEGUARD: This function ONLY reads. It never writes to any external
 * config files or environment variables.
 */
export function loadConfig(configFilePath?: string): GixsisProxyConfig {
  // Start with defaults
  const config: GixsisProxyConfig = { ...DEFAULTS };

  // Layer 2: config file overrides
  const filePath = configFilePath || findConfigFile();
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const fileConfig = JSON.parse(raw);
      Object.assign(config, fileConfig);
    } catch {
      // Config file missing or invalid — continue with defaults
    }
  }

  // Layer 3: environment variable overrides (highest precedence)
  applyEnvOverrides(config);

  // Resolve derived paths
  if (!config.workspaceRoot) {
    config.workspaceRoot = detectWorkspaceRoot();
  }
  if (!config.certsDir) {
    config.certsDir = path.join(__dirname, '..', 'certs');
  }
  if (!config.stateDir) {
    config.stateDir = path.join(config.workspaceRoot, '.gixsis-proxy');
  }
  if (!config.logDir) {
    config.logDir = path.join(config.stateDir, 'logs');
  }
  if (!config.trainingOutputDir) {
    config.trainingOutputDir = path.join(
      config.workspaceRoot,
      '01-ageixtic', '06-training', 'gixsis-training', 'fine-tuning',
    );
  }

  return config;
}

/** Apply environment variable overrides to config */
function applyEnvOverrides(config: GixsisProxyConfig): void {
  const env = process.env;

  if (env.GIXSIS_PROXY_ENABLED !== undefined) {
    config.enabled = env.GIXSIS_PROXY_ENABLED !== 'false' && env.GIXSIS_PROXY_ENABLED !== '0';
  }
  if (env.GIXSIS_PROXY_PORT) {
    config.port = parseInt(env.GIXSIS_PROXY_PORT, 10) || config.port;
  }
  if (env.GIXSIS_PROXY_API_KEY || env.ANTHROPIC_API_KEY) {
    config.anthropicApiKey = env.GIXSIS_PROXY_API_KEY || env.ANTHROPIC_API_KEY;
  }
  if (env.GIXSIS_PROXY_ANTHROPIC_URL) {
    config.anthropicBaseUrl = env.GIXSIS_PROXY_ANTHROPIC_URL;
  }
  if (env.GIXSIS_PROXY_SOVEREIGN_ENDPOINT) {
    config.sovereignEndpoint = env.GIXSIS_PROXY_SOVEREIGN_ENDPOINT;
  }
  if (env.GIXSIS_PROXY_BADGE) {
    config.ageixtBadge = env.GIXSIS_PROXY_BADGE;
  }
  if (env.GIXSIS_PROXY_NAME) {
    config.ageixtName = env.GIXSIS_PROXY_NAME;
  }
  if (env.GIXSIS_PROXY_ROUTING_MODE) {
    config.routingMode = env.GIXSIS_PROXY_ROUTING_MODE as any;
  }
  if (env.GIXSIS_PROXY_WORKSPACE_ROOT) {
    config.workspaceRoot = env.GIXSIS_PROXY_WORKSPACE_ROOT;
  }
  if (env.GIXSIS_PROXY_CERTS_DIR) {
    config.certsDir = env.GIXSIS_PROXY_CERTS_DIR;
  }
  if (env.GIXSIS_PROXY_STATE_DIR) {
    config.stateDir = env.GIXSIS_PROXY_STATE_DIR;
  }
  if (env.GIXSIS_PROXY_LOG_DIR) {
    config.logDir = env.GIXSIS_PROXY_LOG_DIR;
  }
  if (env.GIXSIS_PROXY_TRAINING_DIR) {
    config.trainingOutputDir = env.GIXSIS_PROXY_TRAINING_DIR;
  }
  if (env.GIXSIS_PROXY_TRAINING_ENABLED !== undefined) {
    config.trainingCaptureEnabled =
      env.GIXSIS_PROXY_TRAINING_ENABLED !== 'false' && env.GIXSIS_PROXY_TRAINING_ENABLED !== '0';
  }
  if (env.GIXSIS_PROXY_CONTEXT_INJECTION !== undefined) {
    config.contextInjectionEnabled =
      env.GIXSIS_PROXY_CONTEXT_INJECTION !== 'false' && env.GIXSIS_PROXY_CONTEXT_INJECTION !== '0';
  }
}

/**
 * Detect the master workspace root by walking up from cwd looking for
 * workspace markers (CLAUDE.md, 01-ageixtic/, gixsis.md).
 * Falls back to process.cwd() if no marker found.
 */
function detectWorkspaceRoot(): string {
  // CLAUDE.md is the definitive workspace root marker.
  // 01-ageixtic alone is NOT sufficient — it can be auto-created by
  // mkdirSync (training output) in any directory.
  const PRIMARY_MARKER = 'CLAUDE.md';
  const SECONDARY_MARKERS = ['gixsis.md'];

  function hasWorkspaceMarker(dir: string): boolean {
    if (fs.existsSync(path.join(dir, PRIMARY_MARKER))) {
      return true;
    }
    for (const marker of SECONDARY_MARKERS) {
      if (fs.existsSync(path.join(dir, marker))) {
        return true;
      }
    }
    return false;
  }

  // Strategy 1: walk up from process.cwd()
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (hasWorkspaceMarker(dir)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Strategy 2: walk up from __dirname (inside codex-gixsis/lib/node/proxy/)
  dir = __dirname;
  for (let i = 0; i < 15; i++) {
    if (hasWorkspaceMarker(dir)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Strategy 3: check common known paths
  const knownPaths = [
    path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'Projects', '00-workspace'),
  ];
  for (const kp of knownPaths) {
    if (fs.existsSync(path.join(kp, PRIMARY_MARKER))) {
      return kp;
    }
  }

  return process.cwd();
}

/** Search for config file in standard locations */
function findConfigFile(): string | null {
  const candidates = [
    path.join(process.cwd(), 'gixsis-proxy.json'),
    path.join(process.cwd(), '.gixsis-proxy', 'config.json'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.gixsis-proxy', 'config.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
