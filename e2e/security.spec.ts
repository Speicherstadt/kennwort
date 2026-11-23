import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";
import { addEntry, goInApp } from "./entries.ts";
import { LEAKED_COUNT, LEAKED_PASSWORD } from "./pwned.ts";

// K-603: „Sicherheit“ – weak, reused and leaked passwords, the leak check off until switched on,
// and „Jetzt ändern“ to the site's well-known address. The e2e server asks the stand-in of
// e2e/pwned-server.ts, never the real service.
test.use({ locale: "de-DE" });

const visible = (page: Page, role: "link" | "button", name: string | RegExp) =>
  page.getByRole(role, { name }).filter({ visible: true }).first();
const add = async (page: Page, login: Parameters<typeof addEntry>[1]) => {
  await visible(page, "link", "Einträge").click();
  await addEntry(page, login);
};
const toSecurity = async (page: Page) => {
  await goInApp(page, "/entries");
  await visible(page, "link", "Einstellungen").click();
  await page.getByRole("button", { name: "Sicherheit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sicherheit" })).toBeVisible();
};
const list = (page: Page, name: string) => page.getByRole("list", { name, exact: true });
/** Every request the page makes for a range of the leak check */
const rangeRequests = (page: Page) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/pwned/")) asked.push(request.url());
  });
  return asked;
};

const shared = "Heizung-Wasser-Licht-42";

test.describe("security overview", { tag: "@phone" }, () => {
  test("shows a weak, a reused and, once switched on, a leaked password; off, nothing goes out", async ({
    page,
  }) => {
    const asked = rangeRequests(page);
    await setUpCompany(page);
    await add(page, { title: "Router", password: shared, website: "http://192.168.178.1/" });
    await add(page, {
      title: "NAS",
      password: shared,
      website: "https://nas.weber-haustechnik.test/",
    });
    await add(page, { title: "Mail info@", password: "sommer2019", website: "https://mail.test/" });
    await add(page, {
      title: "Großhandel",
      password: LEAKED_PASSWORD,
      website: "https://portal.grosshandel.test/login",
    });
    await toSecurity(page);

    await expect(list(page, "Schwach").getByRole("listitem")).toHaveText([/Mail info@/]);
    await expect(list(page, "Mehrfach verwendet").getByRole("listitem")).toHaveText([
      /NAS/,
      /Router/,
    ]);
    await expect(
      page.getByText("Aus. Ohne dein Einschalten geht keine Anfrage hinaus."),
    ).toBeVisible();
    await expect(list(page, "In Datenlecks")).toHaveCount(0);
    // Off: the page asks for no range, however long it stays open
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
    for (const password of [shared, "sommer2019", LEAKED_PASSWORD])
      await expect(page.locator("body")).not.toContainText(password);

    await page.getByRole("switch", { name: "Passwörter gegen bekannte Datenlecks prüfen" }).check();
    await expect(list(page, "In Datenlecks").getByRole("listitem")).toHaveText([/Großhandel/]);
    await expect(list(page, "In Datenlecks")).toContainText(
      `In Datenlecks gesehen: ${LEAKED_COUNT}`,
    );
    await expect(page.getByText("Geprüft.", { exact: true })).toBeVisible();
    expect(asked.length).toBeGreaterThan(0);
    for (const url of asked) expect(new URL(url).pathname).toMatch(/^\/api\/pwned\/[0-9A-F]{5}$/);
    for (const password of [shared, "sommer2019", LEAKED_PASSWORD])
      await expect(page.locator("body")).not.toContainText(password);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test("„Jetzt ändern“ opens the site's well-known address in a new tab, without opener or referrer", async ({
    page,
    context,
  }) => {
    await context.route("https://nas.weber-haustechnik.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>NAS</title>" }),
    );
    await setUpCompany(page);
    await add(page, {
      title: "NAS",
      password: shared,
      website: "https://nas.weber-haustechnik.test/login",
    });
    await add(page, {
      title: "NAS 2",
      password: shared,
      website: "https://nas.weber-haustechnik.test/",
    });
    await toSecurity(page);

    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: "NAS: jetzt ändern", exact: true }).click();
    const tab = await opened;
    await tab.waitForLoadState();
    expect(tab.url()).toBe("https://nas.weber-haustechnik.test/.well-known/change-password");
    expect(await tab.evaluate(() => [window.opener, document.referrer])).toEqual([null, ""]);
    await tab.close();
  });

  test("the owner sees the monthly report without titles until it is read, on every load", async ({
    page,
  }) => {
    await setUpCompany(page);
    await add(page, { title: "Mail info@", password: "sommer2019" });
    await toSecurity(page);
    const report = page.getByRole("region", { name: /^Monatsbericht / });
    await expect(report).toBeVisible();
    await expect(report.getByRole("columnheader", { name: "Schwach" })).toBeVisible();
    await expect(report).not.toContainText("Mail info@");
    await report.getByRole("button", { name: "Gelesen" }).click();
    await expect(report).toHaveCount(0);
    // Remembered in the account state, not on this page: after a reload it stays read
    await page.reload();
    await unlock(page);
    await toSecurity(page);
    await expect(page.getByRole("region", { name: /^Monatsbericht / })).toHaveCount(0);
  });
});
