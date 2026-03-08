// CodeEX Patch — Safe parcel-watcher wrapper for Bun runtime compatibility
// Native @parcel/watcher uses node-gyp-build C++ bindings that crash under Bun.
// This wrapper catches the native binding failure and provides a fs.watch-based
// fallback so file watching actually works in the editor.
// TerraTech Systems — 2026-03-07

let realWatcher;
try {
  realWatcher = require('@parcel/watcher');
} catch (e) {
  console.warn('[CodeEX] @parcel/watcher native binding unavailable — using fs.watch fallback');
  console.warn('[CodeEX] Reason:', e.message);
  realWatcher = null;
}

if (realWatcher) {
  module.exports = realWatcher;
} else {
  // fs.watch-based fallback — provides real file change events to Theia
  const fs = require('fs');
  const path = require('path');

  // Track active watchers for cleanup
  const activeWatchers = new Map();

  // Map fs.watch event types to parcel-watcher event types
  function mapEventType(eventType) {
    // fs.watch gives 'rename' (create/delete) or 'change' (modify)
    // parcel-watcher uses 'create', 'update', 'delete'
    return eventType === 'change' ? 'update' : 'create';
  }

  module.exports = {
    subscribe: async (dir, fn, opts) => {
      dir = path.resolve(dir);
      const ignore = (opts && opts.ignore) || [];

      try {
        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(dir, filename);

          // Check ignore list
          for (const ignorePath of ignore) {
            if (fullPath.startsWith(ignorePath)) return;
          }

          // Emit event in parcel-watcher format
          fn(null, [{
            type: mapEventType(eventType),
            path: fullPath,
          }]);
        });

        // Handle watcher errors gracefully
        watcher.on('error', (err) => {
          console.warn('[CodeEX] fs.watch error:', err.message);
        });

        const key = `${dir}:${fn.toString().slice(0, 50)}`;
        activeWatchers.set(key, watcher);

        return {
          unsubscribe() {
            watcher.close();
            activeWatchers.delete(key);
            return Promise.resolve();
          },
        };
      } catch (err) {
        // If fs.watch fails (e.g., directory doesn't exist), return no-op
        console.warn('[CodeEX] fs.watch subscribe failed for', dir, ':', err.message);
        return {
          unsubscribe() {
            return Promise.resolve();
          },
        };
      }
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
