import { defineConfig, devices } from "@playwright/test";

// What a user does, on the desktop and on a phone: every spec runs on `desktop`, specs tagged
// @phone also on `phone`. The e2e ports (Vite 5176) keep clear of a running dev server.
const port = 5176;
// Where the pinned Playwright's own browser is missing (some sandboxes), CHROMIUM_PATH names another
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "phone", grep: /@phone/, use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: "bun run --cwd apps/web build && bun run --cwd apps/web preview",
    port,
    reuseExistingServer: false,
  },
});
