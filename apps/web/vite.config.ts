import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// A static build with hashed file names: the only kind the service worker can check before an
// update goes live (docs/plan.md, Stack). The component showcase (components.html) is built only
// for the end-to-end tests, never into a release.
const showcase = process.env.KENNWORT_SHOWCASE === "1";
// The app talks to its server on the same origin; in development and in the end-to-end tests Vite
// passes /api and /auth on to the server (dev 18100, e2e 28100), in production a reverse proxy does
const api = process.env.KENNWORT_API ?? "http://localhost:18100";
const proxy = { "/api": api, "/auth": api };

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
  build: {
    target: "es2024",
    rollupOptions: { input: showcase ? ["index.html", "components.html"] : ["index.html"] },
  },
});
