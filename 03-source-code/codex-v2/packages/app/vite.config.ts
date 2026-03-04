import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
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
      external: ["@tauri-apps/api/window", "@tauri-apps/api/core", "@tauri-apps/api"],
      output: {
        manualChunks: {
          codemirror: [
            "@codemirror/view", "@codemirror/state", "@codemirror/commands",
            "@codemirror/language", "@codemirror/autocomplete", "@codemirror/search",
            "@codemirror/lint", "@codemirror/theme-one-dark",
          ],
          "cm-langs": [
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
