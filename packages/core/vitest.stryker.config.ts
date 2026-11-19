import { defineConfig } from "vitest/config";

// Only the tests of packages/core, for Stryker's mutation run (stryker.config.json)
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
