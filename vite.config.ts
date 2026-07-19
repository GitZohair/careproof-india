import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const demoMode = process.env.VITE_DEMO_MODE === "true";

export default defineConfig({
  base: demoMode ? process.env.VITE_BASE_PATH ?? "/careproof-india/" : "/",
  publicDir: demoMode ? "public" : false,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 850,
  },
});
