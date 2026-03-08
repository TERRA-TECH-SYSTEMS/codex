// ============================================================================
// Gixsis Proxy — Sovereign Proxy Server
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// THE TROJAN HORSE (Autonomous Routing Specification Section 4.2)
//
// A localhost HTTP server that intercepts ALL Claude Code API traffic.
// Claude Code's ANTHROPIC_BASE_URL points to http://localhost:{port}.
// The proxy accepts Anthropic Messages API format, can inject operating
// context into system messages, forwards to Anthropic (Mentor channel),
// captures request/response pairs as JSONL training data, counts tokens,
// and streams SSE responses back to Claude Code exactly as Anthropic would.
//
// Claude Code cannot tell the difference — it thinks it is talking to
// Anthropic. The brain routing is sovereign.
// ============================================================================

import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// LAYER 1: FOUNDATIONAL CONTEXT — Re-exported from common/foundational-context.ts
// ---------------------------------------------------------------------------
// Shared between backend (proxy path) and frontend (Theia AI native chat path).
// Single source of truth — no duplication.
// ---------------------------------------------------------------------------

import { FOUNDATIONAL_CONTEXT } from '../../common/foundational-context';
export { FOUNDATIONAL_CONTEXT };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Anthropic Messages API request body */
export interface AnthropicRequest {
  model: string;
  messages: Array<{ role: string; content: string | Array<any> }>;
  max_tokens: number;
  stream?: boolean;
  system?: string | Array<any>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

/** Captured training pair for JSONL output */
export interface TrainingCapture {
  timestamp: string;
  ageixt_badge: string;
  domain: string;
  confidence: number;
  routing_decision: 'mentor' | 'sovereign' | 'dual';
  request: {
    model: string;
    system: string;
    messages: Array<{ role: string; content: string }>;
  };
  response: {
    content: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    stop_reason: string;
  };
}

/** Token usage from a single request/response cycle */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Proxy server configuration */
export interface ProxyConfig {
  port: number;
  anthropicApiKey?: string; // Optional — proxy passes through client auth headers
  anthropicBaseUrl: string;
  anthropicVersion: string;
  certsDir?: string; // Path to certs directory for CONNECT/TLS interception
  // Sovereign routing
  routingMode?: 'mentor-only' | 'passthrough-capture' | 'confidence-based' | 'sovereign-only';
  sovereignEndpoint?: string;
  sovereignConfidenceThreshold?: number;
  dualExecutionLower?: number;
  dualExecutionUpper?: number;
}

/** Proxy statistics */
export interface ProxyStats {
  requests_total: number;
  requests_mentor: number;
  requests_sovereign: number;
  requests_dual: number;
  tokens_input_total: number;
  tokens_output_total: number;
  training_pairs_captured: number;
  start_time: string;
  last_request_time: string | null;
  estimated_context_usage_pct: number;
  connect_tunnels_total: number;
  connect_tunnels_intercepted: number;
  connect_tunnels_passthrough: number;
  connect_tunnels_swallowed: number;
  tunnel_requests_received: number;
  tunnel_errors: string[];
  telemetry_swallowed: number;
  telemetry_domains: Record<string, number>;
  recent_requests: string[];
}

/** Domain routing action for CONNECT tunnels */
type DomainAction = 'intercept' | 'swallow' | 'passthrough';

/** Domain classification result */
interface DomainPolicy {
  action: DomainAction;
  description: string;
}

// ---------------------------------------------------------------------------
// Sovereign Proxy Server
// ---------------------------------------------------------------------------

export class SovereignProxy extends EventEmitter {
  private server: http.Server | null = null;
  private config: ProxyConfig;
  private stats: ProxyStats;
  private contextWindowSize = 200000; // Claude Opus default
  private runningTokenEstimate = 0;
  private tlsContext: tls.SecureContext | null = null;
  private domainCerts: Map<string, tls.SecureContext> = new Map();

  // ---------------------------------------------------------------------------
  // TELEMETRY DOMAIN CLASSIFICATION — HARDCODED (TTS-SOP-MCPDEFENSE-001)
  // Domains known to receive Claude Code telemetry. These are intercepted and
  // silently swallowed — the telemetry sender believes delivery succeeded,
  // but Anthropic/Datadog/Sentry/Statsig receives NOTHING.
  // ---------------------------------------------------------------------------

  private static readonly TELEMETRY_SWALLOW_PATTERNS: Array<{ pattern: RegExp; certKey: string; description: string }> = [
    { pattern: /datadoghq\.com/i, certKey: 'datadog', description: 'Datadog telemetry (logs, APM, metrics)' },
    { pattern: /datadog-agent\.com/i, certKey: 'datadog', description: 'Datadog agent communication' },
    { pattern: /sentry\.io/i, certKey: 'sentry', description: 'Sentry error reporting' },
    { pattern: /statsig\.com/i, certKey: 'statsig', description: 'Statsig feature flags & analytics' },
    { pattern: /statsigapi\.net/i, certKey: 'statsig', description: 'Statsig API' },
  ];

  private static readonly INTERCEPT_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /api\.anthropic\.com/i, description: 'Anthropic Messages API — full pipeline (context injection + training capture)' },
  ];

  constructor(config: ProxyConfig) {
    super();
    this.config = config;
    this.stats = {
      requests_total: 0,
      requests_mentor: 0,
      requests_sovereign: 0,
      requests_dual: 0,
      tokens_input_total: 0,
      tokens_output_total: 0,
      training_pairs_captured: 0,
      start_time: new Date().toISOString(),
      last_request_time: null,
      estimated_context_usage_pct: 0,
      connect_tunnels_total: 0,
      connect_tunnels_intercepted: 0,
      connect_tunnels_passthrough: 0,
      connect_tunnels_swallowed: 0,
      tunnel_requests_received: 0,
      tunnel_errors: [],
      telemetry_swallowed: 0,
      telemetry_domains: {},
      recent_requests: [],
    };
    this.loadTlsCerts();
  }

  /** Load TLS certificates for CONNECT interception and telemetry swallowing */
  private loadTlsCerts(): void {
    const certsDir = this.config.certsDir || path.join(__dirname, '..', 'certs');

    // Load primary Anthropic API cert (for api.anthropic.com interception)
    try {
      const key = fs.readFileSync(path.join(certsDir, 'anthropic-api.key'));
      const cert = fs.readFileSync(path.join(certsDir, 'anthropic-api.pem'));
      const ca = fs.readFileSync(path.join(certsDir, 'gixsis-ca.pem'));
      this.tlsContext = tls.createSecureContext({ key, cert, ca });
      this.emit('log', 'TLS certs loaded — CONNECT interception enabled');
    } catch {
      this.emit('log', 'TLS certs not found — CONNECT interception disabled (reverse proxy only)');
    }

    // Load telemetry domain certs (for silent swallowing)
    const telemetryCertMap: Record<string, { key: string; cert: string }> = {
      datadog: { key: 'telemetry-datadog.key', cert: 'telemetry-datadog.pem' },
      sentry: { key: 'telemetry-sentry.key', cert: 'telemetry-sentry.pem' },
      statsig: { key: 'telemetry-statsig.key', cert: 'telemetry-statsig.pem' },
    };

    const ca = (() => {
      try { return fs.readFileSync(path.join(certsDir, 'gixsis-ca.pem')); } catch { return undefined; }
    })();

    for (const [name, files] of Object.entries(telemetryCertMap)) {
      try {
        const key = fs.readFileSync(path.join(certsDir, files.key));
        const cert = fs.readFileSync(path.join(certsDir, files.cert));
        this.domainCerts.set(name, tls.createSecureContext({ key, cert, ca }));
        this.emit('log', `Telemetry cert loaded: ${name} — swallow capability active`);
      } catch {
        this.emit('log', `Telemetry cert not found: ${name} — swallow unavailable for this domain`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Domain Classification (TTS-SOP-MCPDEFENSE-001 — hardcoded routing)
  // ---------------------------------------------------------------------------

  /** Classify a CONNECT target into a routing policy */
  private classifyDomain(target: string): DomainPolicy {
    const host = target.split(':')[0];

    // Check intercept patterns (Anthropic API — full pipeline)
    for (const entry of SovereignProxy.INTERCEPT_PATTERNS) {
      if (entry.pattern.test(host)) {
        return { action: 'intercept', description: entry.description };
      }
    }

    // Check swallow patterns (telemetry — silent black hole)
    for (const entry of SovereignProxy.TELEMETRY_SWALLOW_PATTERNS) {
      if (entry.pattern.test(host)) {
        return { action: 'swallow', description: entry.description };
      }
    }

    // Everything else — transparent tunnel (no interception)
    return { action: 'passthrough', description: 'Unknown domain — transparent tunnel' };
  }

  /** Get the appropriate TLS cert for a telemetry domain */
  private getDomainCert(host: string): tls.SecureContext | null {
    for (const entry of SovereignProxy.TELEMETRY_SWALLOW_PATTERNS) {
      if (entry.pattern.test(host)) {
        return this.domainCerts.get(entry.certKey) || null;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Server lifecycle
  // -------------------------------------------------------------------------

  /** Start the proxy server on the configured port */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Proxy server is already running');
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.emit('error', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            type: 'error',
            error: { type: 'proxy_error', message: err.message },
          }));
        }
      });
    });

    // -----------------------------------------------------------------
    // CONNECT tunnel handler (forward proxy / HTTPS_PROXY mode)
    // -----------------------------------------------------------------
    // When claude.exe uses HTTPS_PROXY, it sends:
    //   CONNECT api.anthropic.com:443 HTTP/1.1
    // We respond 200, wrap the socket in TLS using our CA-signed cert,
    // parse the decrypted HTTP traffic, and route it through the
    // existing handleRequest pipeline (context injection + training capture).
    // -----------------------------------------------------------------

    // Internal HTTP server that parses decrypted traffic from CONNECT tunnels.
    // It does NOT listen on any port — connections are emitted to it directly.
    const tunnelServer = http.createServer((req, res) => {
      this.stats.tunnel_requests_received++;
      this.emit('log', `Tunnel request received: ${req.method} ${req.url}`);
      this.handleRequest(req, res).catch((err) => {
        this.emit('error', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            type: 'error',
            error: { type: 'proxy_error', message: err.message },
          }));
        }
      });
    });

    this.server.on('connect', (
      req: http.IncomingMessage,
      clientSocket: net.Socket,
      head: Buffer,
    ) => {
      const target = req.url || '';
      this.stats.connect_tunnels_total++;

      // ----- DOMAIN CLASSIFICATION (TTS-SOP-MCPDEFENSE-001) -----
      const policy = this.classifyDomain(target);
      this.emit('log', `CONNECT #${this.stats.connect_tunnels_total}: ${target} → ${policy.action} (${policy.description})`);

      // ----- NO TLS CERTS: all traffic becomes passthrough -----
      if (!this.tlsContext) {
        this.transparentTunnel(target, clientSocket, head);
        return;
      }

      // ----- ROUTE BY DOMAIN POLICY -----
      switch (policy.action) {
        case 'intercept':
          this.interceptTunnel(target, clientSocket, head, tunnelServer);
          break;

        case 'swallow':
          this.swallowTunnel(target, clientSocket, head);
          break;

        case 'passthrough':
        default:
          this.transparentTunnel(target, clientSocket, head);
          break;
      }
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, '127.0.0.1', () => {
        this.emit('started', { port: this.config.port });
        resolve();
      });
      this.server!.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });
    });
  }

  /** Stop the proxy server */
  async stop(): Promise<void> {
    if (!this.server) { return; }
    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.emit('stopped');
        resolve();
      });
    });
  }

  /** Check if the server is running */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /** Get current proxy statistics */
  getStats(): ProxyStats {
    return { ...this.stats };
  }

  /** Update the API key (e.g., after reading from globalState) */
  setApiKey(key: string): void {
    this.config.anthropicApiKey = key;
  }

  /** Get the localhost URL that ANTHROPIC_BASE_URL should point to */
  getProxyUrl(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }

  // -------------------------------------------------------------------------
  // CONNECT Tunnel Methods (Domain-Routed)
  // -------------------------------------------------------------------------

  /** Transparent tunnel — direct TCP pipe with no interception.
   *  Used for unknown domains and when no TLS certs are available. */
  private transparentTunnel(
    target: string,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    this.stats.connect_tunnels_passthrough++;
    const [targetHost, targetPortStr] = target.split(':');
    const targetPort = parseInt(targetPortStr) || 443;
    const upstream = net.connect(targetPort, targetHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) { upstream.write(head); }
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  }

  /** Intercept tunnel — TLS MITM with full handleRequest pipeline.
   *  Used for api.anthropic.com (context injection + training capture). */
  private interceptTunnel(
    target: string,
    clientSocket: net.Socket,
    head: Buffer,
    tunnelServer: http.Server,
  ): void {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const tlsSocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      secureContext: this.tlsContext!,
    });

    if (head.length > 0) {
      tlsSocket.unshift(head);
    }

    this.stats.connect_tunnels_intercepted++;

    tlsSocket.on('error', (err) => {
      const errMsg = `TLS tunnel error for ${target}: ${err.message}`;
      this.emit('log', errMsg);
      this.stats.tunnel_errors.push(errMsg);
      if (this.stats.tunnel_errors.length > 10) {
        this.stats.tunnel_errors.shift();
      }
      clientSocket.destroy();
    });

    tlsSocket.on('secure', () => {
      this.emit('log', `TLS handshake COMPLETED for ${target}`);
    });

    tunnelServer.emit('connection', tlsSocket);
  }

  /** Swallow tunnel — TLS intercept → return 200 OK to everything.
   *  The telemetry sender (claude.exe) believes delivery succeeded.
   *  Anthropic/Datadog/Sentry/Statsig receives NOTHING.
   *  This is Tier 1: Silent Swallow — the simplest and most reliable
   *  countermeasure. No data leaves the machine. */
  private swallowTunnel(
    target: string,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    const hostname = target.split(':')[0];
    const certContext = this.getDomainCert(hostname);

    if (!certContext) {
      // No cert for this telemetry domain — fall back to connection reset
      // This is less clean but still prevents data from leaving
      this.emit('log', `Swallow: No cert for ${hostname} — sending connection reset`);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      clientSocket.destroy();
      this.stats.connect_tunnels_swallowed++;
      this.stats.telemetry_swallowed++;
      this.trackTelemetryDomain(hostname);
      return;
    }

    // Tell the client the tunnel is established
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // TLS handshake with our domain-specific cert
    const tlsSocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      secureContext: certContext,
    });

    if (head.length > 0) {
      tlsSocket.unshift(head);
    }

    this.stats.connect_tunnels_swallowed++;

    tlsSocket.on('error', () => {
      // Swallowed connections erroring is expected and acceptable
      clientSocket.destroy();
    });

    // Create a mini HTTP parser that responds 200 OK to every request
    // This makes the telemetry client believe the data was accepted
    let buffer = '';
    tlsSocket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Simple HTTP request parser — look for double newline (end of headers)
      while (buffer.includes('\r\n\r\n')) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        const headers = buffer.slice(0, headerEnd);
        const firstLine = headers.split('\r\n')[0] || '';

        // Extract Content-Length if present
        const clMatch = headers.match(/content-length:\s*(\d+)/i);
        const contentLength = clMatch ? parseInt(clMatch[1], 10) : 0;

        // Check if we have the full body
        const bodyStart = headerEnd + 4;
        const remaining = buffer.slice(bodyStart);

        if (remaining.length >= contentLength) {
          // Full request received — respond with 200 OK
          const method = firstLine.split(' ')[0] || 'UNKNOWN';
          const path = firstLine.split(' ')[1] || '/';

          this.stats.telemetry_swallowed++;
          this.trackTelemetryDomain(hostname);
          this.emit('log', `Swallowed: ${method} ${path} → ${hostname} (${contentLength} bytes silenced)`);

          // Return a convincing 200 OK response
          const responseBody = JSON.stringify({ status: 'ok' });
          const response = [
            'HTTP/1.1 200 OK',
            `Content-Type: application/json`,
            `Content-Length: ${responseBody.length}`,
            'Connection: keep-alive',
            '',
            responseBody,
          ].join('\r\n');

          try {
            tlsSocket.write(response);
          } catch {
            // Socket may have closed — acceptable
          }

          // Advance buffer past this request
          buffer = remaining.slice(contentLength);
        } else {
          // Waiting for more body data
          break;
        }
      }
    });

    tlsSocket.on('end', () => {
      try { tlsSocket.end(); } catch { /* ok */ }
    });
  }

  /** Track telemetry domain hit count */
  private trackTelemetryDomain(hostname: string): void {
    // Normalize domain: extract the registrable domain
    const parts = hostname.split('.');
    const domain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    this.stats.telemetry_domains[domain] = (this.stats.telemetry_domains[domain] || 0) + 1;
  }

  // -------------------------------------------------------------------------
  // Request handling
  // -------------------------------------------------------------------------

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // Track last 10 request URLs for diagnostics
    const reqInfo = `${req.method} ${req.url} [host: ${req.headers.host || 'none'}]`;
    if (!this.stats.recent_requests) { this.stats.recent_requests = []; }
    this.stats.recent_requests.push(reqInfo);
    if (this.stats.recent_requests.length > 10) {
      this.stats.recent_requests.shift();
    }

    // Parse URL path without query string for matching.
    // Handle both relative (/v1/messages) and absolute (http://host/v1/messages) URLs.
    // Absolute URLs come from HTTP proxy mode (HTTPS_PROXY with HTTP targets).
    let urlPath = (req.url || '').split('?')[0];
    try {
      if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
        urlPath = new URL(urlPath).pathname;
      }
    } catch { /* keep original urlPath if URL parsing fails */ }

    // Handle POST /v1/messages — the Anthropic Messages API endpoint
    if (req.method === 'POST' && urlPath === '/v1/messages') {
      await this.handleMessagesApi(req, res);
      return;
    }

    // Health check endpoint for diagnostics
    if (req.method === 'GET' && (urlPath === '/health' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        proxy: 'gixsis-sovereign-proxy',
        version: '0.4.0',
        tls_interception: this.tlsContext !== null,
        telemetry_countermeasures: {
          active: this.domainCerts.size > 0,
          domains_covered: Array.from(this.domainCerts.keys()),
          total_swallowed: this.stats.telemetry_swallowed,
          domains_hit: this.stats.telemetry_domains,
        },
        certs_dir: this.config.certsDir || 'default',
        stats: this.stats,
      }));
      return;
    }

    // Pass through any other Anthropic API endpoints unchanged
    await this.forwardToAnthropic(req, res);
  }

  private async handleMessagesApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // Read the full request body
    const body = await this.readBody(req);
    let parsed: AnthropicRequest;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: { type: 'invalid_request', message: 'Invalid JSON body' },
      }));
      return;
    }

    this.stats.requests_total++;
    this.stats.last_request_time = new Date().toISOString();

    // --- CONTEXT INJECTION POINT ---
    // The identity-manager can register a transform function that prepends
    // the full operating context (Covenant, Trillion Protocol, SOPs, etc.)
    // to the system message before forwarding.
    const transformed = this.applySystemMessageTransform(parsed);

    // --- ROUTING DECISION ---
    const route = this.decideRoute();

    if (route === 'sovereign-only' && this.config.sovereignEndpoint) {
      this.stats.requests_sovereign++;
      await this.forwardToSovereign(transformed, req, res);
    } else {
      // Default: mentor (passthrough-capture and confidence-based both use mentor in Phase 1-2)
      this.stats.requests_mentor++;
      if (transformed.stream) {
        await this.forwardStreamingToMentor(transformed, req, res);
      } else {
        await this.forwardNonStreamingToMentor(transformed, req, res);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Routing decision
  // -------------------------------------------------------------------------

  /** Decide route based on config.routingMode */
  private decideRoute(): 'mentor' | 'sovereign-only' {
    const mode = this.config.routingMode || 'passthrough-capture';

    if (mode === 'sovereign-only' && this.config.sovereignEndpoint) {
      return 'sovereign-only';
    }

    // confidence-based and dual execution will be Phase 3-5.
    // For now, passthrough-capture and confidence-based both route to mentor.
    return 'mentor';
  }

  // -------------------------------------------------------------------------
  // Sovereign endpoint forwarding
  // -------------------------------------------------------------------------

  /** Forward request to sovereign TerraForge endpoint (OpenAI-compatible) */
  private async forwardToSovereign(
    parsed: AnthropicRequest,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): Promise<void> {
    const endpoint = this.config.sovereignEndpoint!;
    const url = new URL('/v1/chat/completions', endpoint);

    // Convert Anthropic Messages API to OpenAI Chat Completions format
    const messages: Array<Record<string, string>> = [];

    // System message
    const systemText = typeof parsed.system === 'string'
      ? parsed.system
      : Array.isArray(parsed.system)
        ? parsed.system.map((s: any) => s.text || '').join('\n')
        : '';
    if (systemText) {
      messages.push({ role: 'system', content: systemText });
    }

    // User/assistant messages
    for (const msg of parsed.messages) {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }

    const body = JSON.stringify({
      model: parsed.model,
      messages,
      max_tokens: parsed.max_tokens,
      temperature: parsed.temperature ?? 0.7,
      stream: parsed.stream ?? false,
    });

    const transport = url.protocol === 'https:' ? https : http;

    return new Promise<void>((resolve, reject) => {
      const proxyReq = transport.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer terrapin',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 120000,
      }, (proxyRes) => {
        // Stream response back to client
        const headers: Record<string, string | string[]> = {};
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (val !== undefined) {
            headers[key] = val as string | string[];
          }
        }
        clientRes.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(clientRes);

        let fullResponse = '';
        proxyRes.on('data', (chunk: Buffer) => {
          fullResponse += chunk.toString();
        });

        proxyRes.on('end', () => {
          // Emit training capture for sovereign responses
          const capture: TrainingCapture = {
            timestamp: new Date().toISOString(),
            ageixt_badge: '',
            domain: '',
            confidence: 1.0,
            routing_decision: 'sovereign' as const,
            request: {
              model: parsed.model,
              system: systemText,
              messages: parsed.messages.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              })),
            },
            response: {
              content: fullResponse.slice(0, 10000),
              model: parsed.model,
              input_tokens: 0,
              output_tokens: 0,
              stop_reason: 'end_turn',
            },
          };
          this.stats.training_pairs_captured++;
          this.emit('training-capture', capture);
          resolve();
        });
        proxyRes.on('error', reject);
      });

      proxyReq.on('error', (err) => {
        this.emit('error', err);
        // Fallback to mentor on sovereign failure
        this.emit('log', `Sovereign endpoint failed: ${err.message} — falling back to mentor`);
        this.stats.requests_sovereign--;
        this.stats.requests_mentor++;
        if (parsed.stream) {
          this.forwardStreamingToMentor(parsed, clientReq, clientRes).then(resolve, reject);
        } else {
          this.forwardNonStreamingToMentor(parsed, clientReq, clientRes).then(resolve, reject);
        }
      });

      proxyReq.write(body);
      proxyReq.end();
    });
  }

  // -------------------------------------------------------------------------
  // System message transform (context injection hook)
  // -------------------------------------------------------------------------

  private systemMessageTransform:
    | ((req: AnthropicRequest) => AnthropicRequest)
    | null = null;

  /** Register a transform that modifies the system message before forwarding.
   *  Used by identity-manager.ts to inject the full operating context. */
  registerSystemMessageTransform(
    fn: (req: AnthropicRequest) => AnthropicRequest,
  ): void {
    this.systemMessageTransform = fn;
  }

  private applySystemMessageTransform(
    req: AnthropicRequest,
  ): AnthropicRequest {
    // Layer 2: Identity manager provides ageixt-specific context ON TOP of
    // the foundational context. If registered, it is responsible for
    // including FOUNDATIONAL_CONTEXT + its own ageixt-specific payload.
    if (this.systemMessageTransform) {
      return this.systemMessageTransform(req);
    }

    // FAILSAFE: No identity manager registered — inject Layer 1 only.
    // The ageixt will operate in FOUNDATIONAL MODE with the Covenant,
    // Trillion Protocol, and core SOPs. It will not have ageixt-specific
    // identity but it will NEVER wake up empty.
    return this.injectFoundationalContext(req);
  }

  /** Inject Layer 1 foundational context into the system message */
  private injectFoundationalContext(req: AnthropicRequest): AnthropicRequest {
    const existingSystem = typeof req.system === 'string'
      ? req.system
      : Array.isArray(req.system)
        ? req.system.map((s: any) => s.text || '').join('\n')
        : '';

    return {
      ...req,
      system: FOUNDATIONAL_CONTEXT + '\n\n' + existingSystem,
    };
  }

  // -------------------------------------------------------------------------
  // Mentor channel forwarding (streaming)
  // -------------------------------------------------------------------------

  private async forwardStreamingToMentor(
    parsed: AnthropicRequest,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): Promise<void> {
    const upstreamUrl = new URL('/v1/messages', this.config.anthropicBaseUrl);
    const requestBody = JSON.stringify(parsed);

    const options: https.RequestOptions = {
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(clientReq),
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    return new Promise<void>((resolve, reject) => {
      const transport = upstreamUrl.protocol === 'https:' ? https : http;
      const proxyReq = transport.request(options, (proxyRes) => {
        // Forward status and headers to Claude Code
        const headers: Record<string, string | string[]> = {};
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (val !== undefined) {
            headers[key] = val as string | string[];
          }
        }
        clientRes.writeHead(proxyRes.statusCode || 200, headers);

        // Collect SSE chunks for training capture
        let fullResponseText = '';
        let usage: TokenUsage = {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        };
        let responseModel = parsed.model;
        let stopReason = '';

        proxyRes.on('data', (chunk: Buffer) => {
          // Forward chunk to Claude Code immediately (zero latency added)
          clientRes.write(chunk);

          // Parse SSE events for token counting and training capture
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) { continue; }
            const data = line.slice(6).trim();
            if (data === '[DONE]') { continue; }
            try {
              const event = JSON.parse(data);
              // Extract text deltas
              if (event.type === 'content_block_delta'
                && event.delta?.type === 'text_delta') {
                fullResponseText += event.delta.text || '';
              }
              // Extract usage from message_start
              if (event.type === 'message_start' && event.message?.usage) {
                usage.input_tokens = event.message.usage.input_tokens || 0;
                usage.cache_creation_input_tokens =
                  event.message.usage.cache_creation_input_tokens;
                usage.cache_read_input_tokens =
                  event.message.usage.cache_read_input_tokens;
                responseModel = event.message.model || parsed.model;
              }
              // Extract usage from message_delta
              if (event.type === 'message_delta') {
                if (event.usage) {
                  usage.output_tokens = event.usage.output_tokens || 0;
                }
                stopReason = event.delta?.stop_reason || '';
              }
            } catch {
              // Non-JSON SSE lines are normal (event: type lines, empty lines)
            }
          }
        });

        proxyRes.on('end', () => {
          clientRes.end();

          // Update token stats
          usage.total_tokens = usage.input_tokens + usage.output_tokens;
          this.stats.tokens_input_total += usage.input_tokens;
          this.stats.tokens_output_total += usage.output_tokens;
          this.runningTokenEstimate += usage.total_tokens;
          this.stats.estimated_context_usage_pct = Math.min(
            100,
            Math.round(
              (this.runningTokenEstimate / this.contextWindowSize) * 100,
            ),
          );

          // Emit training capture event
          const systemText = typeof parsed.system === 'string'
            ? parsed.system
            : Array.isArray(parsed.system)
              ? parsed.system.map((s: any) => s.text || '').join('\n')
              : '';

          const capture: TrainingCapture = {
            timestamp: new Date().toISOString(),
            ageixt_badge: '', // Set by identity-manager via event listener
            domain: '',       // Set by identity-manager via event listener
            confidence: 0,    // Set by identity-manager via event listener
            routing_decision: 'mentor',
            request: {
              model: parsed.model,
              system: systemText,
              messages: parsed.messages.map((m) => ({
                role: m.role,
                content: typeof m.content === 'string'
                  ? m.content
                  : JSON.stringify(m.content),
              })),
            },
            response: {
              content: fullResponseText,
              model: responseModel,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              stop_reason: stopReason,
            },
          };

          this.stats.training_pairs_captured++;
          this.emit('training-capture', capture);
          this.emit('token-usage', usage);

          // Emit compaction warning if threshold crossed
          if (this.stats.estimated_context_usage_pct >= 70) {
            this.emit('compaction-warning', {
              pct: this.stats.estimated_context_usage_pct,
              tokens: this.runningTokenEstimate,
              window: this.contextWindowSize,
            });
          }

          resolve();
        });

        proxyRes.on('error', (err) => {
          this.emit('error', err);
          if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({
              type: 'error',
              error: { type: 'upstream_error', message: err.message },
            }));
          }
          reject(err);
        });
      });

      proxyReq.on('error', (err) => {
        this.emit('error', err);
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({
            type: 'error',
            error: { type: 'connection_error', message: err.message },
          }));
        }
        reject(err);
      });

      proxyReq.write(requestBody);
      proxyReq.end();
    });
  }

  // -------------------------------------------------------------------------
  // Mentor channel forwarding (non-streaming)
  // -------------------------------------------------------------------------

  private async forwardNonStreamingToMentor(
    parsed: AnthropicRequest,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): Promise<void> {
    const upstreamUrl = new URL('/v1/messages', this.config.anthropicBaseUrl);
    const requestBody = JSON.stringify(parsed);

    const options: https.RequestOptions = {
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(clientReq),
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    return new Promise<void>((resolve, reject) => {
      const transport = upstreamUrl.protocol === 'https:' ? https : http;
      const proxyReq = transport.request(options, (proxyRes) => {
        const chunks: Buffer[] = [];

        proxyRes.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        proxyRes.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString();

          // Forward to Claude Code
          const headers: Record<string, string | string[]> = {};
          for (const [key, val] of Object.entries(proxyRes.headers)) {
            if (val !== undefined) {
              headers[key] = val as string | string[];
            }
          }
          clientRes.writeHead(proxyRes.statusCode || 200, headers);
          clientRes.end(responseBody);

          // Parse response for training capture
          try {
            const respParsed = JSON.parse(responseBody);
            const content = respParsed.content
              ?.map((c: any) => c.text || '')
              .join('') || '';
            const usage: TokenUsage = {
              input_tokens: respParsed.usage?.input_tokens || 0,
              output_tokens: respParsed.usage?.output_tokens || 0,
              total_tokens:
                (respParsed.usage?.input_tokens || 0) +
                (respParsed.usage?.output_tokens || 0),
            };

            this.stats.tokens_input_total += usage.input_tokens;
            this.stats.tokens_output_total += usage.output_tokens;
            this.runningTokenEstimate += usage.total_tokens;
            this.stats.estimated_context_usage_pct = Math.min(
              100,
              Math.round(
                (this.runningTokenEstimate / this.contextWindowSize) * 100,
              ),
            );

            const systemText = typeof parsed.system === 'string'
              ? parsed.system
              : Array.isArray(parsed.system)
                ? parsed.system.map((s: any) => s.text || '').join('\n')
                : '';

            const capture: TrainingCapture = {
              timestamp: new Date().toISOString(),
              ageixt_badge: '',
              domain: '',
              confidence: 0,
              routing_decision: 'mentor',
              request: {
                model: parsed.model,
                system: systemText,
                messages: parsed.messages.map((m) => ({
                  role: m.role,
                  content: typeof m.content === 'string'
                    ? m.content
                    : JSON.stringify(m.content),
                })),
              },
              response: {
                content,
                model: respParsed.model || parsed.model,
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                stop_reason: respParsed.stop_reason || '',
              },
            };

            this.stats.training_pairs_captured++;
            this.emit('training-capture', capture);
            this.emit('token-usage', usage);

            if (this.stats.estimated_context_usage_pct >= 70) {
              this.emit('compaction-warning', {
                pct: this.stats.estimated_context_usage_pct,
                tokens: this.runningTokenEstimate,
                window: this.contextWindowSize,
              });
            }
          } catch {
            // Non-JSON response — forward as-is, skip capture
          }

          resolve();
        });

        proxyRes.on('error', (err) => {
          this.emit('error', err);
          reject(err);
        });
      });

      proxyReq.on('error', (err) => {
        this.emit('error', err);
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({
            type: 'error',
            error: { type: 'connection_error', message: err.message },
          }));
        }
        reject(err);
      });

      proxyReq.write(requestBody);
      proxyReq.end();
    });
  }

  // -------------------------------------------------------------------------
  // Generic passthrough for non-messages endpoints
  // -------------------------------------------------------------------------

  private async forwardToAnthropic(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): Promise<void> {
    const upstreamUrl = new URL(
      clientReq.url || '/',
      this.config.anthropicBaseUrl,
    );
    const body = await this.readBody(clientReq);

    const options: https.RequestOptions = {
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: clientReq.method || 'GET',
      headers: {
        ...clientReq.headers,
        host: upstreamUrl.hostname,
        ...this.buildAuthHeaders(clientReq),
      },
    };
    // Remove proxy-specific headers
    delete (options.headers as Record<string, unknown>)['connection'];

    return new Promise<void>((resolve, reject) => {
      const transport = upstreamUrl.protocol === 'https:' ? https : http;
      const proxyReq = transport.request(options, (proxyRes) => {
        const headers: Record<string, string | string[]> = {};
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (val !== undefined) {
            headers[key] = val as string | string[];
          }
        }
        clientRes.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(clientRes);
        proxyRes.on('end', resolve);
        proxyRes.on('error', reject);
      });

      proxyReq.on('error', (err) => {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({
            type: 'error',
            error: { type: 'connection_error', message: err.message },
          }));
        }
        reject(err);
      });

      if (body) { proxyReq.write(body); }
      proxyReq.end();
    });
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /** Build auth headers by passing through the client's original auth.
   *  Claude Code sends its own authentication (OAuth bearer token or API key).
   *  The proxy relays whatever the client provides. Falls back to configured
   *  API key only if the client sends no auth headers. */
  private buildAuthHeaders(
    clientReq: http.IncomingMessage,
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    // Pass through client's authorization header (OAuth bearer token)
    if (clientReq.headers['authorization']) {
      headers['authorization'] = clientReq.headers['authorization'] as string;
    }

    // Pass through client's x-api-key header
    if (clientReq.headers['x-api-key']) {
      headers['x-api-key'] = clientReq.headers['x-api-key'] as string;
    }

    // Pass through anthropic-version from client if present
    if (clientReq.headers['anthropic-version']) {
      headers['anthropic-version'] =
        clientReq.headers['anthropic-version'] as string;
    } else {
      headers['anthropic-version'] = this.config.anthropicVersion;
    }

    // Pass through anthropic-beta if present
    if (clientReq.headers['anthropic-beta']) {
      headers['anthropic-beta'] =
        clientReq.headers['anthropic-beta'] as string;
    }

    // Fallback: use configured API key only if client sent no auth at all
    if (!headers['authorization'] && !headers['x-api-key']
      && this.config.anthropicApiKey) {
      headers['x-api-key'] = this.config.anthropicApiKey;
    }

    return headers;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  /** Reset the running token estimate (e.g., on new conversation) */
  resetTokenEstimate(): void {
    this.runningTokenEstimate = 0;
    this.stats.estimated_context_usage_pct = 0;
  }

  /** Set the context window size for percentage calculations */
  setContextWindowSize(tokens: number): void {
    this.contextWindowSize = tokens;
  }
}
