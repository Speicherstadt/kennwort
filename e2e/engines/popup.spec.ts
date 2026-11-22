import { expect, type Page, test } from "@playwright/test";
import texts from "../../apps/extension/src/popup/popup.test-data.json" with { type: "json" };
import { newDevice, PASSPHRASE, setUpCompany } from "../account.ts";
import { addEntry } from "../entries.ts";
import { type ApiRecord, installBrowserApi } from "./browser-api.ts";
import { apiOf, buildOf } from "./engine.ts";
import { EXTENSION_PORT } from "./serve.ts";

// K-407: the popup as built for each browser (dist/firefox in Firefox, dist/safari in WebKit,
// dist/chrome in Chromium), in that engine, against the e2e server: connect, unlock with the web
// app's flow, the login for the page's exact host, keys only in the session area, locked again.
const text = texts.de;
const PORTAL = "https://portal.weber-haustechnik.test/login";
const PASSWORD = "Kupfer-Rohr-17!";
const POPUP = `http://localhost:${EXTENSION_PORT}`;

/** Jonas's company with the portal's login, set up in the web app in the same engine */
const companyWithLogin = async (page: Page) => {
  const owner = await setUpCompany(page);
  await addEntry(page, {
    title: "Großhandel Portal",
    username: "jonas.weber",
    password: PASSWORD,
    website: PORTAL,
  });
  const { accountId } = JSON.parse(owner.device) as { accountId: string };
  return { accountId, secretKey: owner.secretKey };
};

const record = (popup: Page) =>
  popup.evaluate(() =>
    (globalThis as unknown as { kennwortTest: { read(): ApiRecord } }).kennwortTest.read(),
  );

test("the popup of this browser's build connects, unlocks, finds the page's login and locks", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const build = buildOf(info);
  const web = await newDevice(browser);
  const { accountId, secretKey } = await companyWithLogin(web);
  await web.context().close();

  const context = await browser.newContext({
    locale: "de-DE",
    viewport: { width: 360, height: 600 },
    // The popup is a client of its own for the server's rate limits (e2e/account.ts)
    extraHTTPHeaders: {
      "x-kennwort-build": build,
      "x-forwarded-for": `10.251.${info.parallelIndex}.${info.retry + 1}`,
    },
  });
  await context.addInitScript(installBrowserApi, { pageUrl: PORTAL, ...apiOf(build) });
  const popup = await context.newPage();
  const errors: string[] = [];
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`${POPUP}/popup.html`);

  await expect(popup.getByRole("heading", { level: 1 })).toHaveText(text.connectTitle);
  await popup.getByLabel(text.server, { exact: true }).fill(POPUP);
  await popup.getByLabel(text.accountId, { exact: true }).fill(accountId);
  await popup.getByLabel(text.secretKey, { exact: true }).fill(secretKey);
  await popup.getByLabel(text.passphrase, { exact: true }).fill(PASSPHRASE);
  await popup.getByRole("button", { name: text.connect }).click();

  const forPortal = popup.getByRole("region", {
    name: text.forHost.replace("{host}", "portal.weber-haustechnik.test"),
  });
  await expect(forPortal.getByRole("listitem")).toHaveText([/Großhandel Portal/], {
    timeout: 60_000,
  });
  await expect(popup.getByText(PASSWORD)).toHaveCount(0);

  // Keys only in the session area, closed to content scripts where the browser lets it be asked
  await expect
    .poll(async () => Object.keys((await record(popup)).session).sort())
    .toEqual(["kennwort-alert", "kennwort-device", "kennwort-keys", "kennwort-state"]);
  const unlocked = await record(popup);
  expect(unlocked.accessLevel).toBe(apiOf(build).accessLevel ? "TRUSTED_CONTEXTS" : undefined);
  expect(JSON.stringify(unlocked.session)).not.toContain(PASSPHRASE);
  expect(JSON.stringify(unlocked.session)).not.toContain(PASSWORD);
  // The lock alarm, ten minutes ahead (the company's default)
  const ringsIn = (unlocked.alarms["kennwort-lock"] ?? 0) - Date.now();
  expect(ringsIn).toBeGreaterThan(9 * 60_000);
  expect(ringsIn).toBeLessThanOrEqual(10 * 60_000);
  expect(
    await popup.evaluate(async () => [
      localStorage.length,
      sessionStorage.length,
      (await indexedDB.databases()).length,
    ]),
  ).toEqual([0, 0, 0]);

  // Locking clears the keys and the alert list and keeps the device
  await popup.getByRole("button", { name: text.lock, exact: true }).click();
  await expect(popup.getByRole("heading", { level: 1 })).toHaveText(text.lockedTitle);
  expect(Object.keys((await record(popup)).session).sort()).toEqual([
    "kennwort-device",
    "kennwort-state",
  ]);
  expect(errors).toEqual([]);
  await context.close();
});
