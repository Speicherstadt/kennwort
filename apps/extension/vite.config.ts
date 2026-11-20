import { crx } from "@crxjs/vite-plugin";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { paraglideWithoutStorage } from "./build/paraglide.ts";
import { type Browser, manifest } from "./src/manifest.ts";

// `vite build` builds for Chrome and Edge into dist/chrome, `vite build --mode firefox` for Firefox
// into dist/firefox; src/manifest.ts holds the two differences of the manifest. `--mode e2e` builds
// the Chrome extension for the end-to-end tests into dist/e2e, with access to the test pages
// (src/manifest.ts, E2E_HOSTS). The texts come through a Paraglide runtime without localStorage
// (build/paraglide.ts).
export default defineConfig(({ mode }) => {
  const browser: Browser = mode === "firefox" ? "firefox" : "chrome";
  const outDir = mode === "e2e" ? "e2e" : browser;
  return {
    plugins: [
      paraglideWithoutStorage(),
      solid(),
      tailwindcss(),
      crx({ manifest: manifest(browser, mode === "e2e"), browser }),
    ],
    build: { target: "es2024", outDir: `dist/${outDir}`, emptyOutDir: true },
  };
});
