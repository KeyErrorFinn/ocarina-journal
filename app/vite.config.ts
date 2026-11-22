import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Private browser-review data must never be copied into an installer by Vite's public-directory handling.
  publicDir: false,
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
});
