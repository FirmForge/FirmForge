import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri loads the built assets from src-tauri/../dist; keep the dev server
// port fixed so tauri.conf.json devUrl stays in sync.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5273,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    target: "chrome110",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
