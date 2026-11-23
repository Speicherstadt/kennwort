import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test } from "./account.ts";
import { heading } from "./company.ts";
import { addEntry, goInApp } from "./entries.ts";

// K-601 (P-18): Jonas sends the site's WLAN to a craftsman without an account, as a one-time link
// that opens twice. A link preview that loads the page takes nothing; the craftsman opens it twice,
// and the third time it is gone. The secret in the fragment never reaches the server, and the
// fragment leaves the address as soon as the page loads.
test.use({ locale: "de-DE" });

const SECRET = "Rohr-Ventil-Baustelle-2026!";

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

/** Every request a page makes other than loading the document itself, with its body */
const recordRequests = (page: Page) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (!request.isNavigationRequest()) sent.push(`${request.url()} ${request.postData() ?? ""}`);
  });
  return sent;
};

const linksPage = async (page: Page) => {
  await goInApp(page, "/entries");
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Einmal-Links" }).click();
  await expect(heading(page, "Einmal-Links")).toBeVisible();
};

/** Someone without an account opens the address in a browser of their own */
const outsiderOpens = async (browser: Browser, address: string) => {
  const outsider = await newDevice(browser);
  const sent = recordRequests(outsider);
  await outsider.goto(address);
  await expect(heading(outsider, "Geteiltes Geheimnis")).toBeVisible();
  // The fragment is gone from the address and the history entry before anything else happens
  const url = new URL(address);
  expect(outsider.url()).toBe(`${url.origin}${url.pathname}`);
  expect(await outsider.evaluate(() => location.hash)).toBe("");
  return { outsider, sent, secret: url.hash.slice(1) };
};

test.describe("one-time links", { tag: "@phone" }, () => {
  test("Jonas sends a login that opens twice; a preview takes nothing, the third time it is gone", async ({
    page,
    browser,
    request,
  }) => {
    await setUpCompany(page);
    await addEntry(page, { title: "WLAN Baustelle", username: "weber-gast", password: SECRET });
    const sent = recordRequests(page);
    await page.getByRole("button", { name: "Weitere Aktionen" }).filter({ visible: true }).click();
    await page.getByRole("menuitem", { name: "Einmal-Link" }).click();
    const dialog = page.getByRole("dialog", { name: "Einmal-Link für WLAN Baustelle" });
    await expect(dialog).toContainText("Im Link: Benutzername, Passwort");
    await dialog.getByLabel("Abrufe").selectOption("2");
    await axe(page);
    await dialog.getByRole("button", { name: "Link erstellen" }).click();
    const address = await dialog.getByLabel("Einmal-Link").inputValue();
    const url = new URL(address);
    expect(url.pathname).toMatch(/^\/s\/[A-Za-z0-9_-]{22}$/);
    expect(url.hash).toMatch(/^#[A-Za-z0-9_-]{43}$/);
    // Nothing secret went to the server: neither the link's secret nor the password in plain text
    expect(sent.some((line) => line.includes("/api/links"))).toBe(true);
    expect(sent.join("\n")).not.toContain(url.hash.slice(1));
    expect(sent.join("\n")).not.toContain(SECRET);
    await dialog.getByRole("button", { name: "Fertig" }).click();

    // A link preview fetches the address, a mail scanner even renders the page: neither clicks
    expect((await request.get(address)).status()).toBe(200);
    const scanner = await outsiderOpens(browser, address);
    await expect(scanner.outsider.getByRole("button", { name: "Anzeigen" })).toBeVisible();
    await axe(scanner.outsider);
    await scanner.outsider.context().close();
    await linksPage(page);
    await expect(page.getByRole("list", { name: "Deine aktiven Links" })).toContainText(
      "noch 2 von 2 Abrufen",
    );

    for (const left of ["noch 1-mal öffnen", "damit verbraucht"]) {
      const { outsider, sent: theirs, secret } = await outsiderOpens(browser, address);
      await outsider.getByRole("button", { name: "Anzeigen" }).click();
      await expect(outsider.getByText("WLAN Baustelle")).toBeVisible();
      await expect(outsider.getByText(left)).toBeVisible();
      await expect(outsider.getByText(SECRET)).toHaveCount(0);
      await outsider.getByRole("button", { name: "Passwort aufdecken" }).click();
      await expect(outsider.getByText(SECRET)).toBeVisible();
      expect(theirs.some((line) => line.includes("/auth/links/"))).toBe(true);
      expect(theirs.join("\n")).not.toContain(secret);
      await outsider.context().close();
    }

    const { outsider } = await outsiderOpens(browser, address);
    await outsider.getByRole("button", { name: "Anzeigen" }).click();
    await expect(outsider.getByRole("alert")).toContainText("abgelaufen");
    await expect(outsider.getByText(SECRET)).toHaveCount(0);
    await outsider.context().close();
    await linksPage(page);
    await expect(page.getByText("Keine aktiven Links.")).toBeVisible();
  });

  test("Jonas sends a free text under a passphrase, and revokes another link before it is opened", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    await linksPage(page);
    await page.getByLabel("Titel (optional)").fill("Tür-Code Lager");
    await page.getByLabel("Geheimnis").fill("4711");
    await page.getByLabel("Passphrase (optional)").fill("Pumpe Rohr");
    await page.getByRole("button", { name: "Link erstellen" }).click();
    const guarded = await page
      .getByRole("textbox", { name: "Einmal-Link", exact: true })
      .inputValue();
    await page.getByRole("button", { name: "Fertig" }).click();
    await page.getByLabel("Geheimnis").fill("Alarmanlage 0815");
    await page.getByRole("button", { name: "Link erstellen" }).click();
    const revoked = await page
      .getByRole("textbox", { name: "Einmal-Link", exact: true })
      .inputValue();
    await page.getByRole("button", { name: "Fertig" }).click();
    const list = page.getByRole("list", { name: "Deine aktiven Links" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    // The newest is listed first
    await list
      .getByRole("button", { name: /widerrufen$/ })
      .first()
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(1);

    const gone = await outsiderOpens(browser, revoked);
    await gone.outsider.getByRole("button", { name: "Anzeigen" }).click();
    await expect(gone.outsider.getByRole("alert")).toContainText("abgelaufen");
    await gone.outsider.context().close();

    const { outsider } = await outsiderOpens(browser, guarded);
    await outsider.getByRole("button", { name: "Anzeigen" }).click();
    await outsider.getByLabel("Passphrase").fill("Pumpe");
    await outsider.getByRole("button", { name: "Öffnen" }).click();
    await expect(outsider.getByRole("alert")).toContainText("Die Passphrase stimmt nicht.");
    await outsider.getByLabel("Passphrase").fill("Pumpe Rohr");
    await outsider.getByRole("button", { name: "Öffnen" }).click();
    await expect(outsider.getByText("Tür-Code Lager")).toBeVisible();
    await outsider.getByRole("button", { name: "Geheimnis aufdecken" }).click();
    await expect(outsider.getByText("4711")).toBeVisible();
    await outsider.context().close();
  });
});
