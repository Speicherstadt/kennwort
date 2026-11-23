import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

// K-705: the screenshots of README.md and docs/ against the servers of the e2e tests, never part of
// `bun run e2e` or CI (workflow „Update screenshots“, .github/workflows/screenshots.yml)
export default defineConfig({
  ...base,
  testDir: "e2e/screenshots",
  testMatch: "**/*.shot.ts",
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [
    { name: "screenshots", use: { launchOptions: base.projects?.[0]?.use?.launchOptions } },
  ],
});
