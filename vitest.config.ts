import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

// One run over the whole monorepo; packages keep their tests next to the code. Logic runs in Node,
// interfaces with Solid's compiler in a DOM.
const logic = ["packages/crypto", "packages/core", "apps/server", "apps/cli", "scripts"];
const interfaces = ["packages/ui", "apps/web", "apps/extension", "apps/mobile"];
const tests = (dirs: string[]) => dirs.map((dir) => `${dir}/**/*.test.{ts,tsx}`);

export default defineConfig({
  test: {
    projects: [
      { test: { name: "logic", include: tests(logic) } },
      {
        plugins: [solid()],
        test: { name: "interface", include: tests(interfaces), environment: "happy-dom" },
      },
    ],
  },
});
