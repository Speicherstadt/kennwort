import { crx } from "@crxjs/vite-plugin";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { paraglideWithoutStorage } from "./build/paraglide.ts";
import { safariManifest } from "./build/safari-manifest.ts";
import { type Browser, manifest } from "./src/manifest.ts";

// `vite build` builds for Chrome and Edge into dist/chrome, `vite build --mode firefox` for Firefox
// on the desktop and Android into dist/firefox, `vite build --mode safari` the folder for
// `xcrun safari-web-extension-converter` into dist/safari (K-407); src/manifest.ts holds the
// differences of the manifest. crxjs knows Chrome and Firefox only: Safari builds as Chrome (a
// service worker), and build/safari-manifest.ts drops the one key Safari does not read. `--mode e2e`
// builds the Chrome extension for the end-to-end tests into dist/e2e, with access to the test pages
// (src/manifest.ts, E2E_HOSTS). The texts come through a Paraglide runtime without localStorage
// (build/paraglide.ts).
const browserOf = (mode: string): Browser =>
  mode === "firefox" || mode === "safari" ? mode : "chrome";

export default defineConfig(({ mode }) => {
  const browser = browserOf(mode);
  const outDir = mode === "e2e" ? "e2e" : browser;
  return {
    plugins: [
      paraglideWithoutStorage(),
      solid(),
      tailwindcss(),
      crx({
        manifest: manifest(browser, mode === "e2e"),
        browser: browser === "firefox" ? "firefox" : "chrome",
      }),
      browser === "safari" && safariManifest(),
    ],
    build: {
      target: "es2024",
      outDir: `dist/${outDir}`,
      emptyOutDir: true,
      // The inline menu's page (K-403) and the save prompt's (K-404); the popup comes in through
      // the manifest
      rollupOptions: { input: { menu: "src/menu/menu.html", prompt: "src/prompt/prompt.html" } },
    },
  };
});
