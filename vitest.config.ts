import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

// One run over the whole monorepo; packages keep their tests next to the code. Logic runs in Node,
// interfaces with Solid's compiler in a DOM. apps/server needs bun:sqlite and runs under `bun test`
// (root script "test").
const logic = ["packages/crypto", "packages/core", "apps/cli", "scripts"];
const interfaces = ["packages/ui", "apps/web", "apps/extension", "apps/mobile"];
const tests = (dirs: string[]) => dirs.map((dir) => `${dir}/**/*.test.{ts,tsx}`);

export default defineConfig({
  test: {
    projects: [
      { test: { name: "logic", include: tests(logic) } },
      {
        plugins: [solid()],
        // Solid's dev build, whose diagnostics fail a test (vitest.solid-diagnostics.ts)
        resolve: { conditions: ["development", "browser"] },
        test: {
          name: "interface",
          include: tests(interfaces),
          environment: "happy-dom",
          setupFiles: ["./vitest.solid-diagnostics.ts"],
        },
      },
    ],
  },
});
