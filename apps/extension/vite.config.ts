import { crx } from "@crxjs/vite-plugin";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { type Browser, manifest } from "./src/manifest.ts";

// `vite build` builds for Chrome and Edge into dist/chrome, `vite build --mode firefox` for Firefox
// into dist/firefox; src/manifest.ts holds the two differences of the manifest
export default defineConfig(({ mode }) => {
  const browser: Browser = mode === "firefox" ? "firefox" : "chrome";
  return {
    plugins: [solid(), tailwindcss(), crx({ manifest: manifest(browser), browser })],
    build: { target: "es2024", outDir: `dist/${browser}`, emptyOutDir: true },
  };
});
