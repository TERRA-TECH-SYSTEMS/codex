// CodeEX Patch — Safe node-metrics wrapper for Bun runtime compatibility
// prom-client calls node:v8.getHeapSpaceStatistics() which Bun hasn't implemented.
// This patched version wraps startCollecting() in try/catch so the ERROR
// becomes a non-fatal warning and the server continues normally.
// TerraTech Systems — 2026-03-07

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeMetricsContribution = void 0;
const tslib_1 = require("tslib");
const prom = require("prom-client");
const inversify_1 = require("@theia/core/shared/inversify");
let NodeMetricsContribution = class NodeMetricsContribution {
    getMetrics() {
        return prom.register.metrics().toString();
    }
    startCollecting() {
        try {
            const collectDefaultMetrics = prom.collectDefaultMetrics;
            // Probe every 5th second.
            collectDefaultMetrics({ timeout: 5000 });
        } catch (e) {
            console.warn('[CodeEX] Metrics collection unavailable under current runtime:', e.message);
        }
    }
};
exports.NodeMetricsContribution = NodeMetricsContribution;
exports.NodeMetricsContribution = NodeMetricsContribution = tslib_1.__decorate([
    (0, inversify_1.injectable)()
], NodeMetricsContribution);
