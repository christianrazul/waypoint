import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// One HTML entry per Tauri webview. M1+ adds hotbar.html, sticky.html, setup.html.
const entries = {
  overlay: "overlay.html",
  spike: "spike.html",
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
