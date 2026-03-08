// CodeEX Patch — Safe parcel-watcher wrapper for Bun runtime compatibility
// Native @parcel/watcher uses node-gyp-build C++ bindings that crash under Bun.
// This wrapper catches the native binding failure and provides no-op fallbacks
// so Theia's filesystem watcher degrades gracefully instead of crash-looping.
// TerraTech Systems — 2026-03-07

let realWatcher;
try {
  realWatcher = require('@parcel/watcher');
} catch (e) {
  console.warn('[CodeEX] @parcel/watcher native binding unavailable — using no-op fallback');
  console.warn('[CodeEX] File watching will use polling fallback. Reason:', e.message);
  realWatcher = null;
}

if (realWatcher) {
  module.exports = realWatcher;
} else {
  // No-op fallback — prevents crash loop in ConnectionErrorHandler
  const path = require('path');

  module.exports = {
    subscribe: async (dir, fn, opts) => {
      return {
        unsubscribe() {
          return Promise.resolve();
        },
      };
    },
    unsubscribe: (dir, fn, opts) => {
      return Promise.resolve();
    },
    writeSnapshot: (dir, snapshot, opts) => {
      return Promise.resolve();
    },
    getEventsSince: (dir, snapshot, opts) => {
      return Promise.resolve([]);
    },
  };
}
