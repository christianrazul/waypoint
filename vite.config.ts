import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Each native window has its own React entry.
const entries = {
  overlay: "overlay.html",
  hotbar: "hotbar.html",
  sticky: "sticky.html",
  setup: "setup.html",
};

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "safari16",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: entries },
  },
});
