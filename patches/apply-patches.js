#!/usr/bin/env node
// CodeEX Patch Applicator — applies Bun compatibility patches after install
// TerraTech Systems — 2026-03-07

const fs = require('fs');
const path = require('path');

const patches = [
  {
    name: 'parcel-watcher-bun-compat',
    source: path.join(__dirname, 'parcel-watcher-bun-compat.js'),
    target: path.join(__dirname, '..', 'node_modules', '@theia', 'core', 'shared', '@parcel', 'watcher', 'index.js'),
  },
  {
    name: 'node-metrics-bun-compat',
    source: path.join(__dirname, 'node-metrics-bun-compat.js'),
    target: path.join(__dirname, '..', 'node_modules', '@theia', 'metrics', 'lib', 'node', 'node-metrics-contribution.js'),
  },
];

for (const patch of patches) {
  try {
    if (!fs.existsSync(path.dirname(patch.target))) {
      console.log(`[patches] Skipping ${patch.name} — target directory not found`);
      continue;
    }
    const content = fs.readFileSync(patch.source, 'utf8');
    fs.writeFileSync(patch.target, content, 'utf8');
    console.log(`[patches] Applied: ${patch.name}`);
  } catch (e) {
    console.error(`[patches] Failed to apply ${patch.name}:`, e.message);
  }
}
