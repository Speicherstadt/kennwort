import { crx } from "@crxjs/vite-plugin";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { paraglideWithoutStorage } from "./build/paraglide.ts";
import { type Browser, manifest } from "./src/manifest.ts";

// `vite build` builds for Chrome and Edge into dist/chrome, `vite build --mode firefox` for Firefox
// into dist/firefox; src/manifest.ts holds the two differences of the manifest. The texts come
// through a Paraglide runtime without localStorage (build/paraglide.ts).
export default defineConfig(({ mode }) => {
  const browser: Browser = mode === "firefox" ? "firefox" : "chrome";
  return {
    plugins: [
      paraglideWithoutStorage(),
      solid(),
      tailwindcss(),
      crx({ manifest: manifest(browser), browser }),
    ],
    build: { target: "es2024", outDir: `dist/${browser}`, emptyOutDir: true },
  };
});
