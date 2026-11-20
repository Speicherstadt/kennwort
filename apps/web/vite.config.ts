import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// A static build with hashed file names: the only kind the service worker can check before an
// update goes live (docs/plan.md, Stack). The component showcase (components.html) is built only
// for the end-to-end tests, never into a release.
const showcase = process.env.KENNWORT_SHOWCASE === "1";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: {
    target: "es2024",
    rollupOptions: { input: showcase ? ["index.html", "components.html"] : ["index.html"] },
  },
});
