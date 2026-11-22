import { defineConfig, devices } from "@playwright/test";
import { EXTENSION_PORT, SERVER_PORT, WEB_PORT } from "./e2e/engines/serve.ts";
import { SETUP_CODE } from "./e2e/setup-code.ts";

// K-407: the extension's popup and fill flow in Gecko and WebKit. Playwright loads extensions only
// into Chromium, so e2e/engines runs the built popup of each browser's build as a page, and the
// fill flow's content-script and service-worker code in a harness
// (apps/extension/harness/engine-harness.ts): the Firefox build in Firefox, the Safari build in
// WebKit (Playwright's stand-in for Safari), the Chrome build in Chromium for comparison. Ports of their own (server 28110, pages 5177 and 5178),
// so the suite runs beside `bun run e2e`.
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e/engines",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  workers: process.env.CI ? 4 : "50%",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // The web app, where each test sets up its company (e2e/account.ts)
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "off",
    serviceWorkers: "block",
    locale: "de-DE",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "bun apps/server/src/main.ts",
      port: SERVER_PORT,
      reuseExistingServer: false,
      env: {
        KENNWORT_PORT: String(SERVER_PORT),
        KENNWORT_DATABASE: ":memory:",
        KENNWORT_LOG_LEVEL: "warn",
        KENNWORT_PUBLIC_URL: `http://localhost:${WEB_PORT}`,
        KENNWORT_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e",
        KENNWORT_SETUP_CODE: SETUP_CODE,
        KENNWORT_BEHIND_PROXY: "true",
      },
    },
    {
      // Every build of the extension (Firefox's linted by addons-linter), the web app, then the pages
      command:
        "bun run --cwd apps/extension build:chrome && bun run --cwd apps/extension build:firefox && bun run --cwd apps/extension build:safari && bun run --cwd apps/web build && bun e2e/engines/serve.ts",
      port: EXTENSION_PORT,
      reuseExistingServer: false,
    },
  ],
});
