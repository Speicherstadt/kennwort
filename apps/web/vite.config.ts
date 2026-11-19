import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

// A static build with hashed file names: the only kind the service worker can check before an
// update goes live (docs/plan.md, Stack).
export default defineConfig({
  plugins: [solid()],
  build: { target: "es2024" },
});
