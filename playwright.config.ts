import { defineConfig, devices } from "@playwright/test";
import { SETUP_CODE } from "./e2e/setup-code.ts";

// What a user does, on the desktop and on a phone: every spec runs on `desktop`, specs tagged
// @phone also on `phone`. The e2e ports (server 28100, Vite 5176) keep clear of a running dev server.
const port = 5176;
const serverPort = 28100;
// Where the pinned Playwright's own browser is missing (some sandboxes), CHROMIUM_PATH names another
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  // Every test sets up its own company (e2e/account.ts), so tests of one file may run side by side;
  // in CI four workers, as many cores as the runner has, elsewhere Playwright's default of half the cores
  fullyParallel: true,
  workers: process.env.CI ? 4 : "50%",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // No service worker outside e2e/pwa.spec.ts: the other tests check the app, not its updates (P-16)
  use: { baseURL: `http://localhost:${port}`, trace: "off", serviceWorkers: "block" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "phone", grep: /@phone/, use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: [
    {
      // A real server with a database in memory: every test sets up its own company (e2e/account.ts)
      command: "bun apps/server/src/main.ts",
      port: serverPort,
      reuseExistingServer: false,
      env: {
        KENNWORT_PORT: String(serverPort),
        KENNWORT_DATABASE: ":memory:",
        KENNWORT_LOG_LEVEL: "warn",
        KENNWORT_PUBLIC_URL: `http://localhost:${port}`,
        KENNWORT_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e",
        KENNWORT_SETUP_CODE: SETUP_CODE,
        // Every test sends its own X-Forwarded-For as its client address (e2e/account.ts)
        KENNWORT_BEHIND_PROXY: "true",
      },
    },
    {
      // The showcase of packages/ui is built for these tests only (apps/web/vite.config.ts)
      command: `KENNWORT_SHOWCASE=1 bun run --cwd apps/web build && KENNWORT_API=http://localhost:${serverPort} bun run --cwd apps/web preview`,
      port,
      reuseExistingServer: false,
    },
  ],
});
