/**
 * K-705: the screenshots of README.md and docs/index.md („Rundgang“), taken against the e2e server
 * with the test data of Weber Haustechnik. Jonas sets up the company once, saves a few logins, adds
 * the vault „Büro“ and Anna joins (a notification); then every screen is taken on the desktop and
 * on a phone, light and dark, at deviceScaleFactor 2, and the extension's popup at 360 × 600.
 * Not a test: it runs only under playwright.screenshots.config.ts, by hand or from the workflow
 * „Update screenshots“, and writes PNGs to SCREENSHOT_DIR (default test-results/screenshots), which
 * the workflow turns into WebP under docs/assets/screenshots/.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, devices, expect, type Page, test } from "@playwright/test";
import { newDevice, PASSPHRASE, setUpCompany, unlock } from "../account.ts";
import { annaJoins, openVaults } from "../company.ts";
import { addEntry, goInApp } from "../entries.ts";
import { launchExtension, openPopup } from "../extension.ts";

const SERVER = "http://localhost:5176";
const PORTAL = "https://portal.weber-haustechnik.test/login";
const out = process.env.SCREENSHOT_DIR ?? join("test-results", "screenshots");

const LOGINS = [
  {
    title: "Großhandel Portal",
    username: "jonas.weber",
    password: "Kupfer-Rohr-17!",
    website: PORTAL,
  },
  {
    title: "Sparkasse",
    username: "weber-haustechnik",
    password: "Rohr-Ventil-2026!",
    website: "https://sparkasse.test",
  },
  {
    title: "Mail info@",
    username: "info@weber-haustechnik.test",
    password: "sommer2019",
    website: "https://mail.weber-haustechnik.test",
  },
  {
    title: "DATEV",
    username: "jonas.weber",
    password: "sommer2019",
    website: "https://datev.test",
  },
  { title: "WLAN Büro", username: "Weber-Buero", password: "Heizung-Wasser-Licht-42" },
];

const schemes = ["light", "dark"] as const;
const layouts = {
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  phone: {
    viewport: devices["Pixel 7"].viewport,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["Pixel 7"].userAgent,
  },
} as const;

/** The screens of the tour and the path inside the app that shows each */
const screens = (entry: string) => [
  { name: "entries", path: "/entries" },
  { name: "entry", path: `/entries/${entry}` },
  { name: "vaults", path: "/vaults" },
  { name: "members", path: "/members" },
  { name: "security", path: "/security" },
  { name: "notifications", path: "/notifications" },
  { name: "settings", path: "/settings" },
];

type Company = { device: string; accountId: string; secretKey: string; entry: string };

const setUpWeber = async (browser: Browser): Promise<Company> => {
  const page = await newDevice(browser);
  const owner = await setUpCompany(page);
  const ids: string[] = [];
  for (const login of LOGINS) ids.push(await addEntry(page, login));
  await page.getByRole("button", { name: "Favorit" }).click();
  await openVaults(page);
  await page
    .getByRole("navigation", { name: "Tresore" })
    .getByRole("button", { name: "Neuer Tresor" })
    .click();
  const dlg = page.getByRole("dialog", { name: "Neuer Tresor" });
  await dlg.getByLabel("Name", { exact: true }).fill("Büro");
  await dlg.getByRole("button", { name: "Tresor anlegen" }).click();
  const anna = await annaJoins(page, browser);
  await anna.context().close();
  await page.context().close();
  const { accountId } = JSON.parse(owner.device) as { accountId: string };
  return { device: owner.device, accountId, secretKey: owner.secretKey, entry: ids[1] ?? "" };
};

/** Waits until fonts and pictures are in and nothing moves any more */
const settle = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
};

const shoot = async (page: Page, name: string) => {
  await settle(page);
  await page.screenshot({ path: join(out, `${name}.png`), animations: "disabled", caret: "hide" });
};

const webScreens = async (browser: Browser, company: Company) => {
  for (const [layout, options] of Object.entries(layouts))
    for (const colorScheme of schemes) {
      const context = await browser.newContext({
        ...options,
        deviceScaleFactor: 2,
        colorScheme,
        locale: "de-DE",
        reducedMotion: "reduce",
        serviceWorkers: "block",
        baseURL: SERVER,
      });
      await context.addInitScript(
        (device) => localStorage.setItem("kennwort-device", device),
        company.device,
      );
      const page = await context.newPage();
      await page.goto("/entries");
      await unlock(page);
      for (const screen of screens(company.entry)) {
        await goInApp(page, screen.path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await shoot(page, `${screen.name}-${layout}-${colorScheme}`);
      }
      await context.close();
    }
};

const popupScreens = async (company: Company) => {
  for (const colorScheme of schemes) {
    const { context, close } = await launchExtension("de-DE", colorScheme, "e2e", 2);
    try {
      await context.route("https://*.weber-haustechnik.test/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html lang="de"><title>Portal</title><h1>Portal</h1>',
        }),
      );
      const tab = context.pages()[0] ?? (await context.newPage());
      await tab.goto(PORTAL);
      const popup = await openPopup(context);
      await popup.getByLabel("Server", { exact: true }).fill(SERVER);
      await popup.getByLabel("Konto-ID", { exact: true }).fill(company.accountId);
      await popup.getByLabel("Secret Key", { exact: true }).fill(company.secretKey);
      await popup.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
      await popup.getByRole("button", { name: "Verbinden und entsperren" }).click();
      await expect(popup.getByRole("listitem").first()).toBeVisible({ timeout: 30_000 });
      await popup.setViewportSize({ width: 360, height: 600 });
      await shoot(popup, `popup-extension-${colorScheme}`);
    } finally {
      await close();
    }
  }
};

test("screenshots of the tour", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(out, { recursive: true });
  const company = await setUpWeber(browser);
  await webScreens(browser, company);
  await popupScreens(company);
});
