// The demo without a server (K-706): unlock, see Weber Haustechnik's entries, add one, and never
// a request beyond the demo's own static files
import { expect, type Request, test } from "@playwright/test";
import { DEMO_PORT } from "./demo.ts";
import { addEntry } from "./entries.ts";

const origin = `http://localhost:${DEMO_PORT}`;
// A favicon counts as "other"; what reaches a server is fetch, XHR, a stream, a socket or a beacon
const DYNAMIC = new Set(["fetch", "xhr", "eventsource", "websocket", "ping"]);

test.use({ locale: "de-DE" });

test.describe("demo", { tag: "@phone" }, () => {
  test("unlocks, shows the entries and adds one, all in the browser", async ({ page }) => {
    const requests: Request[] = [];
    page.on("request", (request) => requests.push(request));
    await page.goto(`${origin}/demo/`);

    const banner = page.getByTestId("demo-banner");
    await expect(banner).toContainText("Demo");
    await expect(banner).toContainText("keine echten Passwörter");
    const passphrase = (await banner.locator("code").textContent()) ?? "";
    expect(passphrase.length).toBeGreaterThan(0);

    const field = page.locator("input[type=password]");
    await expect(field).toBeVisible({ timeout: 30_000 });
    await field.fill(passphrase);
    await field.press("Enter");
    await expect(field).toHaveCount(0, { timeout: 30_000 });

    await expect(page.getByText("Sparkasse").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("WLAN Büro").filter({ visible: true }).first()).toBeVisible();

    await addEntry(page, {
      title: "Großhandel Müller",
      username: "weber",
      password: "Kupfer-Rohr-17",
      website: "https://grosshandel.test",
    });
    // Still marked as a demo once the app is open
    await expect(banner).toBeVisible();

    const strays = requests.filter(
      (request) =>
        !request.url().startsWith(`${origin}/demo/`) ||
        DYNAMIC.has(request.resourceType()) ||
        request.method() !== "GET",
    );
    expect(strays.map((request) => `${request.resourceType()} ${request.url()}`)).toEqual([]);
  });

  test("starts over after a reload", async ({ page }) => {
    await page.goto(`${origin}/demo/`);
    await expect(page.locator("input[type=password]")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => localStorage.getItem("kennwort-device"))).toBeNull();
  });
});
