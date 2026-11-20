import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import texts from "../apps/extension/src/popup/popup.test-data.json" with { type: "json" };
import { newDevice, PASSPHRASE, setUpCompany } from "./account.ts";
import { addEntry } from "./entries.ts";
import {
  collectErrors,
  expectNoAxeViolations,
  extensionWorker,
  launchExtension,
} from "./extension.ts";

// K-402: the popup of the extension in a real Chromium against the e2e server. Jonas sets up his
// company in the web app and saves two logins; the extension connects to the same server, unlocks
// with the web app's flow, shows the login for the page's exact host, searches, filters favorites,
// copies, generates and locks. Keys only ever in chrome.storage.session; nothing is filled in.
const SERVER = "http://localhost:5176";
const PORTAL = "https://portal.weber-haustechnik.test/login";
const SUBDOMAIN = "https://www.portal.weber-haustechnik.test/";
const PORTAL_PASSWORD = "Kupfer-Rohr-17!";
const BANK_PASSWORD = "Rohr-Ventil-2026!";

type Chrome = {
  windows: { create(options: object): Promise<unknown> };
  alarms: { create(name: string, info: { when: number }): Promise<void> };
  storage: Record<"session" | "local" | "sync", { get(keys: null): Promise<object> }>;
};

/** Jonas's company with two logins, made in the web app; what the extension needs to connect */
const companyWithLogins = async (page: Page) => {
  const owner = await setUpCompany(page);
  await addEntry(page, {
    title: "Großhandel Portal",
    username: "jonas.weber",
    password: PORTAL_PASSWORD,
    website: PORTAL,
  });
  await page.getByRole("button", { name: "Favorit" }).click();
  await expect(page.getByRole("button", { name: "Favorit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await addEntry(page, {
    title: "Sparkasse",
    username: "weber",
    password: BANK_PASSWORD,
    website: "https://sparkasse.test",
  });
  const { accountId } = JSON.parse(owner.device) as { accountId: string };
  return { accountId, secretKey: owner.secretKey };
};

/**
 * The popup over the active tab. Playwright cannot click the extension's button, so the service
 * worker opens popup.html in a window of its own; the popup reads the active tab of the last
 * focused normal window, as it does over a real click (apps/extension/src/page/current-page.ts).
 */
const openPopup = async (context: BrowserContext) => {
  const worker = await extensionWorker(context);
  const opened = context.waitForEvent("page");
  await worker.evaluate(() =>
    (globalThis as unknown as { chrome: Chrome }).chrome.windows.create({
      url: "popup.html",
      type: "popup",
      width: 360,
      height: 600,
    }),
  );
  const popup = await opened;
  await popup.waitForLoadState();
  return popup;
};

const storageAreas = async (context: BrowserContext) =>
  (await extensionWorker(context)).evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
    return {
      session: (await chrome.storage.session.get(null)) as Record<string, unknown>,
      local: await chrome.storage.local.get(null),
      sync: await chrome.storage.sync.get(null),
    };
  });

const testPage = (title: string) =>
  `<!doctype html><html lang="de"><title>${title}</title><h1>${title}</h1>`;

const cases = [
  { locale: "de-DE", colorScheme: "light", text: texts.de },
  { locale: "en-US", colorScheme: "dark", text: texts.en },
] as const;

for (const { locale, colorScheme, text } of cases) {
  test(`the popup unlocks, finds the page's login, searches, filters, copies, generates and locks in ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const web = await newDevice(browser);
    const { accountId, secretKey } = await companyWithLogins(web);
    await web.context().close();

    const { context, close } = await launchExtension(locale, colorScheme, "e2e");
    try {
      await context.route("https://*.weber-haustechnik.test/**", (route) =>
        route.fulfill({ contentType: "text/html", body: testPage("Portal") }),
      );
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const tab = context.pages()[0] ?? (await context.newPage());
      await tab.goto(PORTAL);

      const popup = await openPopup(context);
      const errors = collectErrors(popup);
      await expect(popup.getByRole("heading", { level: 1 })).toHaveText(text.connectTitle);
      await popup.getByLabel(text.server, { exact: true }).fill(SERVER);
      await popup.getByLabel(text.accountId, { exact: true }).fill(accountId);
      await popup.getByLabel(text.secretKey, { exact: true }).fill(secretKey);
      await popup.getByLabel(text.passphrase, { exact: true }).fill(PASSPHRASE);
      await popup.getByRole("button", { name: text.connect }).click();

      // The login for the page's exact host, and both logins below
      const forPortal = popup.getByRole("region", {
        name: text.forHost.replace("{host}", "portal.weber-haustechnik.test"),
      });
      await expect(forPortal.getByRole("listitem")).toHaveText([/Großhandel Portal/], {
        timeout: 30_000,
      });
      await expect(popup.getByRole("listitem")).toHaveCount(3);
      await expect(popup.getByText(PORTAL_PASSWORD)).toHaveCount(0);
      await expectNoAxeViolations(popup);

      // Copying on a click: the password reaches the clipboard, the page gets nothing filled in
      await popup.bringToFront();
      await forPortal
        .getByRole("button", { name: text.copyPassword.replace("{title}", "Großhandel Portal") })
        .click();
      await expect
        .poll(() => popup.evaluate(() => navigator.clipboard.readText()))
        .toBe(PORTAL_PASSWORD);
      expect(await tab.evaluate(() => document.querySelectorAll("input").length)).toBe(0);

      // Keys only in chrome.storage.session, and no other store of the extension holds anything
      const areas = await storageAreas(context);
      expect(Object.keys(areas.session).sort()).toEqual(["kennwort-device", "kennwort-keys"]);
      expect(areas.local).toEqual({});
      expect(areas.sync).toEqual({});
      expect(
        await popup.evaluate(async () => [
          localStorage.length,
          sessionStorage.length,
          (await indexedDB.databases()).length,
        ]),
      ).toEqual([0, 0, 0]);

      // Search, never in passwords
      const search = popup.getByRole("searchbox", { name: text.search });
      await search.fill("sparkasse");
      await expect(popup.getByRole("listitem")).toHaveText([/Sparkasse/]);
      await search.fill(BANK_PASSWORD);
      await expect(popup.getByRole("listitem")).toHaveCount(0);
      await search.fill("");

      // Favorites
      await popup.getByRole("button", { name: text.favorites, exact: true }).click();
      await expect(popup.getByRole("listitem")).toHaveText([/Großhandel Portal/]);
      await popup.getByRole("button", { name: text.all, exact: true }).click();

      // Generator
      await popup.getByRole("button", { name: text.generator, exact: true }).click();
      await expect(popup.locator("output")).toHaveText(/^.{20}$/);
      await expectNoAxeViolations(popup);
      expect(errors).toEqual([]);
      await popup.close();

      // Another host, even a subdomain, has no login; the popup opens still unlocked
      const other = await context.newPage();
      await other.goto(SUBDOMAIN);
      await other.bringToFront();
      const again = await openPopup(context);
      const forSubdomain = again.getByRole("region", {
        name: text.forHost.replace("{host}", "www.portal.weber-haustechnik.test"),
      });
      await expect(forSubdomain).toContainText(text.noMatches, { timeout: 30_000 });
      await expect(forSubdomain.getByRole("listitem")).toHaveCount(0);

      // Locking clears the keys from the session area and keeps the device
      await again.getByRole("button", { name: text.lock, exact: true }).click();
      await expect(again.getByRole("heading", { level: 1 })).toHaveText(text.lockedTitle);
      expect(Object.keys((await storageAreas(context)).session)).toEqual(["kennwort-device"]);
      await expectNoAxeViolations(again);

      // The passphrase alone unlocks again; the lock alarm clears the keys when it rings
      await again.getByLabel(text.passphrase, { exact: true }).fill(PASSPHRASE);
      await again.getByRole("button", { name: text.unlock, exact: true }).click();
      await expect(again.getByRole("searchbox", { name: text.search })).toBeVisible({
        timeout: 30_000,
      });
      await (await extensionWorker(context)).evaluate(() =>
        (globalThis as unknown as { chrome: Chrome }).chrome.alarms.create("kennwort-lock", {
          when: Date.now() + 500,
        }),
      );
      await expect
        .poll(async () => Object.keys((await storageAreas(context)).session), { timeout: 15_000 })
        .toEqual(["kennwort-device"]);
    } finally {
      await close();
    }
  });
}
