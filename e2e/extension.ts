/**
 * The extension in a real Chromium for the end-to-end tests: an extension needs a persistent
 * context of its own, launched with the built extension (playwright.config.ts builds dist/chrome,
 * the release build, and dist/e2e, which may also read the addresses of the test pages under .test).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, chromium, expect, type Page } from "@playwright/test";

const dist = join(import.meta.dirname, "..", "apps", "extension", "dist");

export const launchExtension = async (
  locale: string,
  colorScheme: "light" | "dark",
  build: "chrome" | "e2e" = "chrome",
) => {
  const extension = join(dist, build);
  const userDataDir = mkdtempSync(join(tmpdir(), "kennwort-extension-"));
  const executablePath = process.env.CHROMIUM_PATH;
  const context = await chromium.launchPersistentContext(userDataDir, {
    // The bundled headless shell cannot load extensions; the full Chromium can, headless too
    ...(executablePath ? { executablePath } : { channel: "chromium" }),
    locale,
    colorScheme,
    viewport: { width: 360, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  return {
    context,
    close: () =>
      context.close().finally(() => rmSync(userDataDir, { recursive: true, force: true })),
  };
};

/** The extension's service worker, where the test reads the browser's storage areas */
export const extensionWorker = async (context: BrowserContext) =>
  context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

/** The extension's ID, read from its service worker's URL (chrome-extension://<id>/...) */
export const extensionId = async (context: BrowserContext) =>
  new URL((await extensionWorker(context)).url()).host;

/** Every error a page logs, to check that there was none */
export const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
};

export const expectNoAxeViolations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
