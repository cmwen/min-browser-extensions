import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const target = process.env.EXTENSION_TARGET ?? "chrome";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: `dist/${target}`,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        dashboard: resolve(__dirname, "dashboard.html"),
      },
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/[name].js",
      },
    },
  },
});
