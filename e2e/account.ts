/**
 * Accounts for the end-to-end tests: the server in playwright.config.ts accepts this setup code,
 * so every test that needs one sets up its own company, the way a first owner does (P-01).
 */
import { type Browser, test as base, expect, type Page } from "@playwright/test";

import { SETUP_CODE } from "./setup-code.ts";

export { SETUP_CODE };
export const PASSPHRASE = "Pumpe Kessel Rohr Ventil";

export type Owner = { token: string; secretKey: string; recoveryKey: string; device: string };

/** Sets up a company in the browser and returns what the kit showed and the owner's session token */
export const setUpCompany = async (page: Page, passphrase = PASSPHRASE): Promise<Owner> => {
  await page.goto("/setup");
  await page.locator("input:not([type=password])").first().fill(SETUP_CODE);
  for (const field of await page.locator("input[type=password]").all())
    await field.fill(passphrase);
  const answer = page.waitForResponse((response) => response.url().endsWith("/auth/setup"));
  await page.locator("button[type=submit]").click();
  const { token } = (await (await answer).json()) as { token: string };
  const secretKey = (await page.getByTestId("secret-key").textContent()) ?? "";
  const recoveryKey = (await page.getByTestId("recovery-key").textContent()) ?? "";
  await page.getByRole("checkbox").check();
  await page.getByRole("button").last().click();
  await expect(page.getByRole("navigation").first()).toBeAttached();
  const device = await page.evaluate(() => localStorage.getItem("kennwort-device") ?? "");
  return { token, secretKey, recoveryKey, device };
};

/** Unlocks a device that knows the account, in whatever language the page speaks */
export const unlock = async (page: Page, passphrase = PASSPHRASE) => {
  await page.locator("input[type=password]").fill(passphrase);
  await page.locator("input[type=password]").press("Enter");
  await expect(page.locator("input[type=password]")).toHaveCount(0, { timeout: 20_000 });
};

/**
 * Every test is its own client: the server counts the address in X-Forwarded-For (it runs as if
 * behind a proxy), so the sign-in rate limits, tested on their own, do not throttle the suite.
 */
let clients = 0;
const nextAddress = (worker: number) => {
  clients += 1;
  return `10.${worker % 250}.${Math.floor(clients / 250) % 250}.${clients % 250}`;
};

/** Another device: a fresh browser context, a client of its own */
export const newDevice = async (browser: Browser) => {
  const address = nextAddress(base.info().parallelIndex);
  const context = await browser.newContext({
    locale: "de-DE",
    extraHTTPHeaders: { "x-forwarded-for": address },
  });
  return context.newPage();
};

const newOwner = async (browser: Browser, worker: number) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": nextAddress(worker) },
  });
  const owner = await setUpCompany(await context.newPage());
  await context.close();
  return owner;
};

/**
 * Tests of the unlocked app: one company per worker, a device that knows it in every test, and
 * `open(path)` to go to a page and unlock (the keys live in memory only, so every load locks).
 */
export const test = base.extend<{ open: (path: string) => Promise<void> }, { owner: Owner }>({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) =>
    use({ ...extraHTTPHeaders, "x-forwarded-for": nextAddress(testInfo.parallelIndex) }),
  owner: [
    async ({ browser }, use, workerInfo) => use(await newOwner(browser, workerInfo.parallelIndex)),
    { scope: "worker" },
  ],
  open: async ({ page, owner }, use) => {
    await page.addInitScript(
      (device) => localStorage.setItem("kennwort-device", device),
      owner.device,
    );
    await use(async (path) => {
      await page.goto(path);
      await unlock(page);
    });
  },
});
