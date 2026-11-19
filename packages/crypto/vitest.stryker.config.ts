import { defineConfig } from "vitest/config";

// Only the tests of packages/crypto, for Stryker's mutation run (stryker.config.json)
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
