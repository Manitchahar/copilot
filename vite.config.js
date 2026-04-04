import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/components/connectors/") || id.includes("/src/hooks/useConnectorConfig")) {
            return "connectors";
          }
          if (id.includes("react-router")) {
            return "router";
          }
          if (id.includes("node_modules")) {
            // Let markdown ecosystem stay with the dynamic import boundary
            if (
              id.includes("react-markdown") ||
              id.includes("remark-") ||
              id.includes("rehype-") ||
              id.includes("highlight.js") ||
              id.includes("lowlight") ||
              id.includes("micromark") ||
              id.includes("mdast") ||
              id.includes("hast-") ||
              id.includes("unist-") ||
              id.includes("unified") ||
              id.includes("fault") ||
              id.includes("devlop") ||
              id.includes("property-information") ||
              id.includes("space-separated-tokens") ||
              id.includes("comma-separated-tokens") ||
              id.includes("vfile") ||
              id.includes("bail") ||
              id.includes("trough") ||
              id.includes("is-plain-obj") ||
              id.includes("decode-named-character-reference") ||
              id.includes("character-entities") ||
              id.includes("ccount") ||
              id.includes("escape-string-regexp") ||
              id.includes("markdown-table") ||
              id.includes("zwitch") ||
              id.includes("longest-streak") ||
              id.includes("trim-lines") ||
              id.includes("style-to-js") ||
              id.includes("style-to-object") ||
              id.includes("inline-style-parser") ||
              id.includes("parse-entities") ||
              id.includes("stringify-entities") ||
              id.includes("estree-util") ||
              id.includes("html-url-attributes") ||
              id.includes("html-void-elements") ||
              id.includes("dequal") ||
              id.includes("/extend/") ||
              id.includes("structured-clone")
            ) {
              return undefined;
            }
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    watch: {
      ignored: [
        "**/.git/**",
        "**/node_modules/**",
        "**/.venv/**",
        "**/venv/**",
        "**/oi-venv311/**",
        "**/.uploads/**",
        "**/.cloudcowork/**",
        "**/dist/**",
        "**/open-interpreter/**",
      ],
    },
    proxy: {
      "/sessions": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/config": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
