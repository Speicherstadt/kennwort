import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openVaults } from "./company.ts";

// K-307 part b (P-11): Anna leaves Büro, and then the company. Jonas's client signs remove and
// rotate, writes every entry anew under the new key and marks what Anna could read "Zum Ändern";
// the exit report lists it. Anna opens nothing written after she left.
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const visibleLink = (page: Page, name: string) =>
  page.getByRole("link", { name }).filter({ visible: true }).first();

/** A login in Büro, written through the app's dialog */
const loginInBuero = async (page: Page, title: string, password: string) => {
  await visibleLink(page, "Einträge").click();
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const editor = page.getByRole("dialog", { name: "Neuer Eintrag" });
  await editor.getByLabel("Tresor").selectOption({ label: "Büro" });
  await editor.getByLabel("Titel").fill(title);
  await editor.getByLabel("Benutzername").fill("buero@weber-haustechnik.test");
  await editor.getByLabel("Passwort", { exact: true }).fill(password);
  await editor.getByRole("button", { name: "Speichern" }).click();
  await expect(editor).toBeHidden();
  await expect(heading(page, title)).toBeVisible();
};

/** Jonas creates Büro, takes Anna in to edit and writes the Sparkasse login; Anna reads it */
const annaInBuero = async (page: Page, anna: Page) => {
  await openVaults(page);
  await page.getByLabel("Name").fill("Büro");
  await page.getByRole("button", { name: "Tresor anlegen" }).click();
  await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
  const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
  await dialog.getByLabel("Person").selectOption({ label: "Anna" });
  await dialog.getByLabel("Rolle", { exact: true }).selectOption("edit");
  await dialog.getByRole("button", { name: "Aufnehmen" }).click();
  await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("edit");
  await dialog.getByRole("button", { name: "Schließen" }).click();
  await loginInBuero(page, "Sparkasse", "Rohr-Ventil-Kessel-2026!");
  await openVaults(anna);
  await visibleLink(anna, "Einträge").click();
  await expect(anna.getByRole("option", { name: /Sparkasse/ })).toBeVisible();
};

/** Under „Zum Ändern“: the Sparkasse login, and why */
const markedForAnna = async (page: Page) => {
  await visibleLink(page, "Einträge").click();
  await visibleLink(page, "Zum Ändern").click();
  await expect(heading(page, "Zum Ändern")).toBeVisible();
  await page.getByRole("option", { name: /Sparkasse/ }).click();
  const note = page.getByRole("note", { name: "Zum Ändern" });
  await expect(note).toContainText("Anna hatte Zugriff bis");
  await expect(note).toContainText("Ändere: Passwort.");
};

/** Anna loads anew: no Büro, and neither the old login nor one written after she left */
const annaSeesNothing = async (anna: Page) => {
  await anna.reload();
  await unlock(anna, "Anna Heizung Bad Fliese");
  await openVaults(anna);
  // With no vault left the page shows the empty state instead of an (empty, hidden) list
  const main = anna.getByRole("main");
  await expect(main.getByRole("list").or(main.getByText("Noch keine Tresore."))).toBeVisible();
  await expect(main).not.toContainText("Büro");
  await visibleLink(anna, "Einträge").click();
  await expect(anna.getByRole("option", { name: /Neuer Zugang/ })).toHaveCount(0);
  await expect(anna.getByRole("option", { name: /Sparkasse/ })).toHaveCount(0);
};

test.describe("leaving a vault", { tag: "@phone" }, () => {
  test("Jonas removes Anna from Büro: new key, the login marked, and Anna opens nothing new", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await annaInBuero(page, anna);

    // Removing writes the remove, the rotation with the new key, and the login anew (P-11)
    await openVaults(page);
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    const rotation = page.waitForRequest(
      (r) =>
        r.method() === "POST" &&
        r.url().endsWith("/log") &&
        "wrappedKeys" in (r.postDataJSON() ?? {}),
    );
    const rewritten = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/records"),
    );
    await dialog.getByRole("button", { name: "Anna aus dem Tresor entfernen" }).click();
    expect((await rotation).postDataJSON()).toMatchObject({
      entry: { action: "rotate", epoch: 1 },
    });
    expect((await rewritten).postDataJSON()).toMatchObject({ version: 2, epoch: 1 });
    await expect(
      dialog.getByRole("list", { name: "Mitglieder des Tresors" }).getByRole("listitem"),
    ).toHaveCount(1);
    await dialog.getByRole("button", { name: "Schließen" }).click();

    await markedForAnna(page);
    await axe(page);
    await loginInBuero(page, "Neuer Zugang", "Fliese-Bad-Heizung-2027!");
    await annaSeesNothing(anna);

    // Changing the password clears the mark
    await visibleLink(page, "Einträge").click();
    await page.getByRole("option", { name: /Sparkasse/ }).click();
    await page.getByRole("button", { name: "Bearbeiten" }).click();
    const editor = page.getByRole("dialog", { name: "Eintrag bearbeiten" });
    await editor.getByLabel("Passwort", { exact: true }).fill("Wasser-Licht-Rohr-2027!");
    await editor.getByRole("button", { name: "Speichern" }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole("note", { name: "Zum Ändern" })).toHaveCount(0);
    await visibleLink(page, "Einträge").click();
    await visibleLink(page, "Zum Ändern").click();
    await expect(heading(page, "Zum Ändern")).toBeVisible();
    await expect(page.getByRole("option", { name: /Sparkasse/ })).toHaveCount(0);
  });
});

test.describe("leaving the company", { tag: "@phone" }, () => {
  test("Jonas removes Anna from the company: the vaults catch up, and he reads her exit report", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await annaInBuero(page, anna);

    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Mitglieder" }).click();
    const members = page.getByRole("list", { name: "Mitglieder" });
    await members.getByRole("button", { name: "Anna aus der Firma entfernen" }).click();
    const confirm = page.getByRole("dialog", { name: "Anna aus der Firma entfernen" });
    await expect(confirm).toContainText("kommt sofort nicht mehr an den Server");
    await axe(page);
    await confirm.getByRole("button", { name: "Entfernen" }).click();
    const row = members.getByRole("listitem").filter({ hasText: "Anna" });
    await expect(row).toContainText("Ausgetreten");

    // Jonas's client takes her out of Büro and rotates by itself
    await openVaults(page);
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const vaultDialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await expect(
      vaultDialog.getByRole("list", { name: "Mitglieder des Tresors" }).getByRole("listitem"),
    ).toHaveCount(1);
    await vaultDialog.getByRole("button", { name: "Schließen" }).click();
    await markedForAnna(page);

    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Mitglieder" }).click();
    await page.getByRole("button", { name: "Austritts-Bericht für Anna" }).click();
    const report = page.getByRole("dialog", { name: "Austritts-Bericht für Anna" });
    const vaults = report.getByRole("list", { name: "Tresore" });
    await expect(vaults).toContainText("Büro");
    await expect(vaults).toContainText("Bearbeiten ·");
    await expect(vaults.getByRole("list", { name: "Büro" })).toContainText("Sparkasse");
    await expect(vaults.getByRole("list", { name: "Büro" })).toContainText(
      "Geheime Felder: Passwort",
    );
    await axe(page);
    await report.getByRole("button", { name: "Schließen" }).click();

    // Anna's device gets nothing any more: not the login, and not one written after she left
    await loginInBuero(page, "Neuer Zugang", "Fliese-Bad-Heizung-2027!");
    await anna.reload();
    await anna.locator("input[type=password]").fill("Anna Heizung Bad Fliese");
    await anna.locator("input[type=password]").press("Enter");
    await expect(anna.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(anna.getByText("Neuer Zugang")).toHaveCount(0);
    await expect(anna.getByText("Sparkasse")).toHaveCount(0);
  });
});
