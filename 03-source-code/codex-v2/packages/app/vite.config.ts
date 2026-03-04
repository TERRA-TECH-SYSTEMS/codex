import { defineConfig, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";

/** Stub Tauri APIs when running in browser dev mode (not inside Tauri). */
function tauriStubPlugin(): Plugin {
  const TAURI_MODULES = ["@tauri-apps/api/window", "@tauri-apps/api/core", "@tauri-apps/api"];
  return {
    name: "tauri-stub",
    enforce: "pre",
    apply: "serve", // Only in dev mode — build always bundles the real packages
    resolveId(id) {
      if (TAURI_MODULES.includes(id)) return `\0tauri-stub:${id}`;
    },
    load(id) {
      if (id.startsWith("\0tauri-stub:")) {
        return "export default {}; export const getCurrentWindow = () => ({ minimize(){}, toggleMaximize(){}, close(){} }); export const appWindow = {}; export const invoke = async () => {};";
      }
    },
  };
}

export default defineConfig({
  plugins: [tauriStubPlugin(), solidPlugin()],
  server: {
    host: "127.0.0.1",
    port: 3100,
    strictPort: true,
    proxy: {
      "/terraforge": {
        target: "http://216.158.238.162:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/terraforge/, ""),
      },
      "/mcp": {
        target: "http://216.158.238.162:9090",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            "@codemirror/view", "@codemirror/state", "@codemirror/commands",
            "@codemirror/language", "@codemirror/autocomplete", "@codemirror/search",
            "@codemirror/lint", "@codemirror/theme-one-dark",
            "@codemirror/lang-javascript", "@codemirror/lang-json",
            "@codemirror/lang-css", "@codemirror/lang-html",
            "@codemirror/lang-markdown", "@codemirror/lang-python",
            "@codemirror/lang-rust", "@codemirror/lang-cpp",
          ],
          xterm: ["@xterm/xterm"],
          markdown: ["marked"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "~": "/src",
    },
  },
});
