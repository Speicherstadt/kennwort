import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { annaJoins, heading, openVaults } from "./company.ts";
import { goInApp } from "./entries.ts";

// K-305 part 6b (P-10): Jonas shares the Sparkasse login of Büro with Anna, who is no member of
// Büro; she reads it under "Mit mir geteilt" and nothing else of Büro. Jonas revokes the share: the
// entry is written anew under a new entry key, and Anna no longer sees it
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const visibleLink = (page: Page, name: string) =>
  page.getByRole("link", { name }).filter({ visible: true }).first();

/** Jonas creates Büro without Anna and writes the Sparkasse login into it */
const sparkasseInBuero = async (page: Page) => {
  await openVaults(page);
  await page.getByLabel("Name").fill("Büro");
  await page.getByRole("button", { name: "Tresor anlegen" }).click();
  await expect(page.getByRole("main").getByRole("list")).toContainText("Büro");
  await visibleLink(page, "Einträge").click();
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
  await editor.getByRole("button", { name: "Speichern" }).click();
  await expect(heading(page, "Sparkasse")).toBeVisible();
};

test.describe("sharing a single entry", { tag: "@phone" }, () => {
  test("Jonas shares a login with Anna outside the vault, then revokes it under a new key", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await sparkasseInBuero(page);

    await page.getByRole("button", { name: "Weitere Aktionen" }).filter({ visible: true }).click();
    await page.getByRole("menuitem", { name: "Teilen" }).click();
    const dialog = page.getByRole("dialog", { name: "Sparkasse teilen" });
    await expect(dialog).toContainText("Noch mit niemandem geteilt.");
    await dialog.getByLabel("Person").selectOption({ label: "Anna" });
    await axe(page);
    await dialog.getByRole("button", { name: "Teilen" }).click();
    const shares = dialog.getByRole("list", { name: "Geteilt mit" });
    await expect(shares.getByRole("listitem")).toHaveCount(1);
    await expect(shares).toContainText("Anna");

    // Anna loads anew: the shared login, read-only, and nothing else of Büro
    await openVaults(anna);
    await expect(anna.getByRole("main").getByRole("list")).not.toContainText("Büro");
    await visibleLink(anna, "Einträge").click();
    await visibleLink(anna, "Mit mir geteilt").click();
    await expect(heading(anna, "Mit mir geteilt")).toBeVisible();
    await anna.getByRole("option", { name: /Sparkasse/ }).click();
    await expect(heading(anna, "Sparkasse")).toBeVisible();
    await expect(anna.getByText(/Geteilt von/)).toBeVisible();
    await anna.getByRole("button", { name: "Passwort aufdecken" }).click();
    await expect(anna.getByText("Rohr-Ventil-2026!")).toBeVisible();
    await expect(anna.getByRole("button", { name: "Bearbeiten" })).toBeDisabled();
    await anna.getByRole("button", { name: "Weitere Aktionen" }).filter({ visible: true }).click();
    await expect(anna.getByRole("menuitem", { name: "Teilen" })).toBeDisabled();
    await anna.keyboard.press("Escape");
    await goInApp(anna, "/entries");
    await expect(anna.getByText("Keine Einträge")).toBeVisible();

    // Revoking writes the next version under a new entry key (P-10)
    const rewritten = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/records"),
    );
    await dialog.getByRole("button", { name: "Freigabe für Anna entfernen" }).click();
    expect((await rewritten).postDataJSON()).toMatchObject({ version: 2 });
    await expect(dialog).toContainText("Noch mit niemandem geteilt.");

    await openVaults(anna);
    await goInApp(anna, "/shared");
    await expect(heading(anna, "Mit mir geteilt")).toBeVisible();
    await expect(anna.getByText("Keine Einträge")).toBeVisible();
    await expect(anna.getByRole("link", { name: "Mit mir geteilt" })).toHaveCount(0);
  });
});
