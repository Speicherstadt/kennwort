import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { addEntry } from "./entries.ts";

// K-501: Jonas brings the company's logins from Bitwarden, Chrome and a spreadsheet into Kennwort
test.use({ locale: "de-DE" });

const fixture = (name: string) => join(import.meta.dirname, "fixtures", name);

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const visibleLink = (page: Page, name: string | RegExp) =>
  page.getByRole("link", { name }).filter({ visible: true }).first();
const option = (page: Page, title: string) => page.getByRole("option", { name: new RegExp(title) });
const rows = (page: Page) => page.getByRole("list", { name: "Einträge in der Datei" });

/** Settings, then „Importieren“, then the vendor and the file */
const importFile = async (page: Page, vendor: string, file: string) => {
  await visibleLink(page, "Einstellungen").click();
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Importieren" })).toBeVisible();
  await page.getByRole("button", { name: vendor, exact: true }).click();
  await expect(page.getByText("So kommst du an die Exportdatei")).toBeVisible();
  await page.getByLabel("Exportdatei wählen").setInputFiles(fixture(file));
};

/** Everything the page sent to the server, as text */
const recordRequests = (page: Page) => {
  const bodies: string[] = [];
  page.on("request", (request) => bodies.push(`${request.url()} ${request.postData() ?? ""}`));
  return bodies;
};

const finish = async (page: Page, count: string) => {
  await page.getByRole("button", { name: count }).click();
  await expect(page.getByText("Import fertig")).toBeVisible();
  await expect(page.getByRole("note")).toContainText(
    "Lösche jetzt die Exportdatei, auch aus Downloads und Papierkorb",
  );
};

test.describe("import", { tag: "@phone" }, () => {
  test("Jonas imports a Bitwarden export; the weak password ends up under Zum Ändern", async ({
    page,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await importFile(page, "Bitwarden (JSON)", "import-bitwarden.json");
    await expect(page.getByText("3 Einträge in der Datei")).toBeVisible();
    await expect(page.getByRole("list", { name: "Arten" })).toContainText("Login: 2");
    const router = rows(page).getByRole("listitem").filter({ hasText: "Router Lager" });
    await expect(router).toContainText("schwach");
    await expect(rows(page)).not.toContainText("sommer2019");
    await page.getByLabel("Ordner als Tags übernehmen").check();
    await axe(page);
    await finish(page, "3 Einträge importieren");
    await expect(page.getByText("3 Einträge importiert.")).toBeVisible();
    await axe(page);

    // Only ciphertext went to the server
    expect(sent.join("\n")).not.toContain("Steuer-Kessel-Rohr-2026!");
    expect(sent.join("\n")).not.toContain("Alarmanlage");

    await page
      .getByRole("link", { name: "Schwache Passwörter unter „Zum Ändern“ ansehen" })
      .click();
    await expect(option(page, "Router Lager")).toBeVisible();
    await expect(option(page, "DATEV")).toHaveCount(0);
    await visibleLink(page, "Einträge").click();
    await option(page, "DATEV Unternehmen online").click();
    await expect(page.getByRole("list", { name: "Tags" })).toHaveText("Büro");
  });

  test("Jonas imports his Chrome passwords and skips the login he already has", async ({
    page,
  }) => {
    await setUpCompany(page);
    await addEntry(page, {
      title: "Sparkasse",
      username: "weber",
      password: "Rohr-Ventil-Pumpe-2026!",
      website: "https://sparkasse.test",
    });
    await importFile(page, "Chrome / Edge / Brave / Opera (CSV)", "import-chrome.csv");
    const sparkasse = rows(page).getByRole("listitem").filter({ hasText: "Sparkasse" });
    await expect(sparkasse).toContainText("doppelt");
    await expect(page.getByText("1 Eintrag gibt es schon und wird übersprungen.")).toBeVisible();
    await finish(page, "1 Eintrag importieren");
    await expect(
      page.getByRole("link", { name: "Schwache Passwörter unter „Zum Ändern“ ansehen" }),
    ).toHaveCount(0);

    await visibleLink(page, "Einträge").click();
    await expect(option(page, "grosshandel.test")).toBeVisible();
    await expect(option(page, "Sparkasse")).toHaveCount(1);
  });

  test("Jonas maps the columns of a spreadsheet and imports it", async ({ page }) => {
    await setUpCompany(page);
    await importFile(page, "Andere Tabelle (CSV)", "import-table.csv");
    await expect(page.getByRole("heading", { name: "Spalten zuordnen" })).toBeVisible();
    await page.getByLabel("Titel").selectOption("Bezeichnung");
    await page.getByLabel("Benutzername").selectOption("Kennung");
    await page.getByLabel("Passwort").selectOption("Geheimwort");
    await axe(page);
    await page.getByRole("button", { name: "Weiter" }).click();
    const nas = rows(page).getByRole("listitem").filter({ hasText: "NAS Büro" });
    await expect(nas).toContainText("admin");
    await finish(page, "1 Eintrag importieren");

    await visibleLink(page, "Einträge").click();
    await option(page, "NAS Büro").click();
    await expect(page.getByRole("heading", { level: 1, name: "NAS Büro" })).toBeVisible();
  });

  test("a file of another vendor says what is wrong", async ({ page }) => {
    await setUpCompany(page);
    await importFile(page, "Bitwarden (JSON)", "import-chrome.csv");
    await expect(page.getByRole("alert")).toHaveText(
      "Das ist keine gültige JSON-Datei. Hast du das richtige Format gewählt?",
    );
  });
});
