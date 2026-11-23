import { defineConfig, devices } from "@playwright/test";
import { DEMO_PORT } from "./e2e/demo.ts";
import { OIDC_CLIENT, OIDC_ISSUER, OIDC_NAME, OIDC_PORT } from "./e2e/oidc.ts";
import { PWNED_PORT } from "./e2e/pwned.ts";
import { SETUP_CODE } from "./e2e/setup-code.ts";

// What a user does, on the desktop and on a phone: every spec runs on `desktop`, specs tagged
// @phone also on `phone`. The e2e port (5176: the server with the web build) keeps clear of a
// running dev server.
const port = 5176;
// Where the pinned Playwright's own browser is missing (some sandboxes), CHROMIUM_PATH names another
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "e2e",
  // e2e/engines runs in Firefox and WebKit under playwright.engines.config.ts (K-407)
  // e2e/screenshots runs only under playwright.screenshots.config.ts (K-705)
  testIgnore: ["engines/**", "screenshots/**"],
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
      // The real server with a database in memory (every test sets up its own company,
      // e2e/account.ts), serving the web build itself with the headers of production
      // (KENNWORT_WEB_ROOT, P-16), so the CSP holds in every test. The showcase of packages/ui is
      // built for these tests only (apps/web/vite.config.ts); the extension is built first for
      // e2e/extension*.spec.ts, which load it into their own Chromium: the release build and the one
      // that may read the test pages' addresses (e2e/extension.ts)
      command:
        "bun run --cwd apps/extension build:chrome && bun run --cwd apps/extension build:e2e && KENNWORT_SHOWCASE=1 bun run --cwd apps/web build && bun apps/server/src/main.ts",
      port,
      reuseExistingServer: false,
      env: {
        KENNWORT_PORT: String(port),
        KENNWORT_DATABASE: ":memory:",
        KENNWORT_LOG_LEVEL: "warn",
        KENNWORT_PUBLIC_URL: `http://localhost:${port}`,
        KENNWORT_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e",
        KENNWORT_SETUP_CODE: SETUP_CODE,
        KENNWORT_WEB_ROOT: "apps/web/dist",
        // Every test sends its own X-Forwarded-For as its client address (e2e/account.ts)
        KENNWORT_BEHIND_PROXY: "true",
        // The leak check (K-603) asks the stand-in below, never the real service
        KENNWORT_PWNED_URL: `http://localhost:${PWNED_PORT}/range/`,
        // Sign-in with OpenID Connect (K-604) against the fake provider below
        KENNWORT_OIDC_ISSUER: OIDC_ISSUER,
        KENNWORT_OIDC_CLIENT_ID: OIDC_CLIENT.id,
        KENNWORT_OIDC_CLIENT_SECRET: OIDC_CLIENT.secret,
        KENNWORT_OIDC_NAME: OIDC_NAME,
      },
    },
    {
      // The fake identity provider of the server tests (apps/server/src/testing/fake-idp-server.ts)
      command: "bun apps/server/src/testing/fake-idp-server.ts",
      port: OIDC_PORT,
      reuseExistingServer: false,
      env: {
        FAKE_IDP_PORT: String(OIDC_PORT),
        FAKE_IDP_ISSUER: OIDC_ISSUER,
        FAKE_IDP_CLIENT_ID: OIDC_CLIENT.id,
        FAKE_IDP_CLIENT_SECRET: OIDC_CLIENT.secret,
      },
    },
    {
      // The demo without a server (K-706), its own build served statically as GitHub Pages does
      command: "bun run --cwd apps/web build:demo && bun e2e/demo-server.ts",
      port: DEMO_PORT,
      reuseExistingServer: false,
    },
    {
      // The stand-in for Have I Been Pwned's Pwned Passwords (e2e/pwned.ts)
      command: "bun e2e/pwned-server.ts",
      port: PWNED_PORT,
      reuseExistingServer: false,
    },
  ],
});
