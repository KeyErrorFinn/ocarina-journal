import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** The files that let a phone put the page on its home screen (a second screen). They are written at fixed names next to
 *  the page, from `src/assets/app-icons`, instead of through a public directory (which is off, below). */
function installable(): Plugin {
  const manifest = {
    name: "Ocarina Journal",
    short_name: "OoT Journal",
    description: "Your Ocarina of Time journal, from your PC.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#14100c",
    theme_color: "#14100c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return {
    name: "oj-installable",
    generateBundle() {
      for (const fileName of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(`src/assets/app-icons/${fileName}`) });
      }
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [react(), installable()],
  // Private browser-review data must never be copied into an installer by Vite's public-directory handling.
  publicDir: false,
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
});
