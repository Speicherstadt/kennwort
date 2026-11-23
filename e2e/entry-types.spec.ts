import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";

// K-306 part 2: every type brings its fields, and an entry can have fields of its own
test.use({ locale: "de-DE" });

const openNew = async (page: Page) => {
  // On a phone the list is a screen of its own
  await page.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  return page.getByRole("form", { name: "Neuer Eintrag" });
};
const fields = (page: Page) => page.getByRole("region", { name: "Felder" });

test.describe("entry types", { tag: "@phone" }, () => {
  test("Jonas keeps the office Wi-Fi with a field of his own and removes it again", async ({
    page,
  }) => {
    await setUpCompany(page);
    const dialog = await openNew(page);
    await dialog.getByLabel("Art", { exact: true }).selectOption({ label: "WLAN" });
    await dialog.getByLabel("Titel").fill("Büro-WLAN");
    await dialog.getByLabel("Netzwerkname").fill("Weber-Buero");
    await dialog.getByRole("button", { name: "Passwort erzeugen" }).click();
    await expect(dialog.getByLabel("Passwort", { exact: true })).toHaveValue(/^.{20}$/);
    await dialog.getByLabel("Sicherheit").fill("WPA3");
    await dialog.getByRole("button", { name: "Feld hinzufügen" }).click();
    await dialog.getByLabel("Name des Felds", { exact: true }).fill("Router");
    await dialog.getByLabel("Art des Felds").selectOption({ label: "Adresse (URL)" });
    await dialog.getByLabel("Router", { exact: true }).fill("https://router.lan");
    const { violations } = await new AxeBuilder({ page }).include("form:has(h1)").analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("heading", { level: 1, name: "Büro-WLAN" })).toBeVisible();
    await expect(page.getByText(/^WLAN · /)).toBeVisible();
    await expect(fields(page)).toContainText("Netzwerkname");
    await expect(fields(page)).toContainText("Weber-Buero");
    await expect(fields(page)).toContainText("WPA3");
    await expect(fields(page)).toContainText("https://router.lan");
    await expect(page.getByRole("button", { name: "Passwort aufdecken" })).toBeVisible();

    await page.getByRole("button", { name: "Bearbeiten" }).click();
    const change = page.getByRole("form", { name: "Eintrag bearbeiten" });
    // The type of a saved entry stays
    await expect(change.getByLabel("Art", { exact: true })).toHaveCount(0);
    await change.getByRole("button", { name: "Router entfernen" }).click();
    await change.getByRole("button", { name: "Speichern" }).click();
    await expect(change).toBeHidden();
    await expect(fields(page)).not.toContainText("https://router.lan");
    await expect(fields(page)).toContainText("Weber-Buero");
  });

  test("a note keeps its lines, and the list shows each type with its own line", async ({
    page,
  }) => {
    await setUpCompany(page);
    const dialog = await openNew(page);
    await dialog.getByLabel("Art", { exact: true }).selectOption({ label: "Notiz" });
    await dialog.getByLabel("Titel").fill("Alarmanlage");
    await dialog.getByLabel("Notiz", { exact: true }).fill("Code: 4711\nSchlüssel beim Nachbarn");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(fields(page)).toContainText("Code: 4711\nSchlüssel beim Nachbarn", {
      useInnerText: true,
    });

    const card = await openNew(page);
    await card.getByLabel("Art", { exact: true }).selectOption({ label: "Karte" });
    await card.getByLabel("Titel").fill("Firmenkarte");
    await card.getByLabel("Karteninhaber").fill("Weber Haustechnik");
    await card.getByLabel("Kartennummer").fill("4111 1111 1111 1111");
    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(card).toBeHidden();
    await expect(fields(page)).not.toContainText("4111");
    await page.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("option", { name: /Firmenkarte/ })).toContainText(
      "Weber Haustechnik",
    );
  });
});
