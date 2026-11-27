import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import {
  addVaultMembers,
  annaJoins,
  createVault,
  heading,
  openVaults,
  selectVault,
} from "./company.ts";
import { addEntry } from "./entries.ts";

// K-306 part 1 (P-09, P-21): entries live in the vaults, sealed on the device; Jonas writes the
// Sparkasse login into Büro, changes it, and Anna reads it there
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

test.describe("entries", { tag: "@phone" }, () => {
  test("Jonas writes a login into Büro and changes it; Anna reads it but may not change it", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await openVaults(page);
    await createVault(page, "Büro");
    await selectVault(page, "Büro");
    await addVaultMembers(page, ["Anna"], "Lesen");
    await expect(page.getByRole("region", { name: "Lesen", exact: true })).toContainText("Anna");

    await page.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
    await page
      .getByRole("button", { name: "Neu", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const editor = page.getByRole("form", { name: "Neuer Eintrag" });
    await editor.getByLabel("Tresor").selectOption({ label: "Büro" });
    await editor.getByLabel("Titel").fill("Sparkasse");
    await editor.getByLabel("Benutzername").fill("jonas@weber-haustechnik.de");
    await editor.getByLabel("Passwort", { exact: true }).fill("Rohr-Ventil-2026!");
    await editor.getByLabel("Website").fill("https://sparkasse.de");
    await axe(page);
    await editor.getByRole("button", { name: "Speichern" }).click();
    await expect(heading(page, "Sparkasse")).toBeVisible();
    await expect(page.getByText("Tresor Büro")).toBeVisible();

    await page.getByRole("button", { name: "Bearbeiten" }).click();
    const change = page.getByRole("form", { name: "Eintrag bearbeiten" });
    await expect(change.getByLabel("Titel")).toHaveValue("Sparkasse");
    await change.getByLabel("Passwort", { exact: true }).fill("Neu-2027!");
    await change.getByRole("button", { name: "Speichern" }).click();
    await expect(change).toBeHidden();
    await page.getByRole("button", { name: "Passwort aufdecken" }).click();
    await expect(page.getByText("Neu-2027!")).toBeVisible();

    // Anna's device pulls Büro, checks every record, and opens the newest version to read
    await openVaults(anna);
    await anna.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
    await anna.getByRole("option", { name: /Sparkasse/ }).click();
    await expect(heading(anna, "Sparkasse")).toBeVisible();
    await anna.getByRole("button", { name: "Passwort aufdecken" }).click();
    await expect(anna.getByText("Neu-2027!")).toBeVisible();
    await expect(anna.getByRole("button", { name: "Bearbeiten" })).toBeDisabled();
  });
});

test("a new account sees no demo entries, only an empty list with the way to a first entry", async ({
  page,
}) => {
  await setUpCompany(page);
  await expect(page.getByText("Sparkasse")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Neu", exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await addEntry(page, { title: "Erster Eintrag" });
});
