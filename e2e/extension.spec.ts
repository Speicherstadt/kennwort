import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, chromium, expect, test } from "@playwright/test";
import texts from "../apps/extension/src/popup/locked-screen.test-data.json" with { type: "json" };

// K-401: the extension loaded into a real Chromium. An extension needs a persistent context of
// its own, launched with the built extension (playwright.config.ts builds it with the web app).
const extension = join(import.meta.dirname, "..", "apps", "extension", "dist", "chrome");

const launch = async (locale: string, colorScheme: "light" | "dark") => {
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

/** The extension's ID, read from its service worker's URL (chrome-extension://<id>/...) */
const extensionId = async (context: BrowserContext) => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return new URL(worker.url()).host;
};

const cases = [
  { locale: "de-DE", colorScheme: "light", text: texts.de },
  { locale: "en-US", colorScheme: "dark", text: texts.en },
] as const;

for (const { locale, colorScheme, text } of cases) {
  test(`the popup shows the locked screen in ${locale}, ${colorScheme}, and axe finds nothing`, async () => {
    const { context, close } = await launch(locale, colorScheme);
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`chrome-extension://${await extensionId(context)}/popup.html`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(text.title);
      await expect(page.getByRole("button", { name: text.passkey })).toBeVisible();
      await expect(page.getByRole("button", { name: text.passphrase })).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
      await page.getByRole("button", { name: text.passkey }).click();
      await expect(page.getByRole("status")).toHaveText(text.notYet);
      expect(errors).toEqual([]);
    } finally {
      await close();
    }
  });
}
