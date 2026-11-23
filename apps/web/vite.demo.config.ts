import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The demo without a server (K-706): the same app over a stand-in in the browser, built on its own
// into dist-demo for /demo/ of the docs site. It shares no output with the release build
// (vite.config.ts), which keeps its CSP headers and signed service worker; no proxy, no server.
export default defineConfig({
  root: "demo",
  base: "/demo/",
  publicDir: "../public",
  plugins: [solid(), tailwindcss()],
  build: { target: "es2024", outDir: "../dist-demo", emptyOutDir: true },
});
