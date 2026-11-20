import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { addEntry, goInApp } from "./entries.ts";

// K-306 part 5: earlier passwords, favorites, tags, the search over everything and „Zum Ändern“
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const visible = (page: Page, role: "link" | "searchbox", name: string | RegExp) =>
  page.getByRole(role, { name }).filter({ visible: true }).first();
/** The list of entries; on a phone a screen of its own */
const toList = (page: Page) => visible(page, "link", "Einträge").click();
const option = (page: Page, title: string) => page.getByRole("option", { name: new RegExp(title) });
const search = async (page: Page, text: string) =>
  visible(page, "searchbox", "Einträge durchsuchen").fill(text);
/** Another entry: on a phone the button for it is on the list's screen */
const add = async (page: Page, login: Parameters<typeof addEntry>[1]) => {
  await toList(page);
  await addEntry(page, login);
};
const editor = (page: Page) => page.getByRole("dialog", { name: "Eintrag bearbeiten" });

test.describe("entry care", { tag: "@phone" }, () => {
  test("Jonas changes the bank password and finds the old one under Frühere Passwörter", async ({
    page,
  }) => {
    await setUpCompany(page);
    await add(page, { title: "Sparkasse", username: "weber", password: "Rohr-Ventil-2026!" });
    await page.getByRole("button", { name: "Bearbeiten" }).click();
    await editor(page).getByLabel("Passwort", { exact: true }).fill("Kessel-Pumpe-2027!");
    await editor(page).getByRole("button", { name: "Speichern" }).click();
    await expect(editor(page)).toBeHidden();

    const earlier = page.getByRole("region", { name: "Frühere Passwörter" });
    await expect(earlier).toContainText("Passwort bis");
    await expect(earlier).not.toContainText("Rohr-Ventil-2026!");
    await expect(earlier.getByRole("button", { name: /^Passwort bis .+ kopieren$/ })).toBeVisible();
    await earlier.getByRole("button", { name: /^Passwort bis .+ aufdecken$/ }).click();
    await expect(earlier).toContainText("Rohr-Ventil-2026!");
    await expect(page.getByRole("region", { name: "Felder" })).not.toContainText("Rohr-Ventil");
    await axe(page);
  });

  test("Jonas marks a favorite and tags an entry, and finds both", async ({ page }) => {
    await setUpCompany(page);
    await add(page, { title: "DATEV", username: "jonas.weber", password: "Kessel-7-Rohr!" });
    await add(page, { title: "Sparkasse", username: "weber", password: "Rohr-Ventil-2026!" });
    const star = page.getByRole("button", { name: "Favorit" });
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await toList(page);
    await visible(page, "link", "Favoriten").click();
    await expect(option(page, "Sparkasse")).toBeVisible();
    await expect(option(page, "DATEV")).toHaveCount(0);

    await toList(page);
    await option(page, "DATEV").click();
    await page.getByRole("button", { name: "Bearbeiten" }).click();
    await editor(page).getByLabel("Neuer Tag").fill("Steuerbüro");
    await editor(page).getByLabel("Neuer Tag").press("Enter");
    await expect(
      editor(page).getByRole("button", { name: "Tag Steuerbüro entfernen" }),
    ).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await editor(page).getByRole("button", { name: "Speichern" }).click();
    await expect(editor(page)).toBeHidden();
    await expect(page.getByRole("list", { name: "Tags" })).toHaveText("Steuerbüro");

    await toList(page);
    await search(page, "steuerburo");
    await expect(option(page, "DATEV")).toBeVisible();
    await expect(option(page, "Sparkasse")).toHaveCount(0);
  });

  test("the search finds an entry by its username, never by its password", async ({ page }) => {
    await setUpCompany(page);
    await add(page, {
      title: "Mail info@",
      username: "info@weber-haustechnik.test",
      password: "Geheim-Kessel-77!",
    });
    await add(page, { title: "Sparkasse", username: "weber", password: "Rohr-Ventil-2026!" });
    await toList(page);
    await search(page, "INFO@weber");
    await expect(option(page, "Mail info@")).toBeVisible();
    await expect(option(page, "Sparkasse")).toHaveCount(0);
    await search(page, "Geheim-Kessel");
    await expect(page.getByText("Keine Einträge")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("two entries with one password and a weak one are under Zum Ändern, with why", async ({
    page,
  }) => {
    await setUpCompany(page);
    const shared = "Heizung-Wasser-Licht-42";
    await add(page, { title: "Router", password: shared });
    await add(page, { title: "NAS", password: shared });
    await add(page, { title: "Mail info@", password: "sommer2019" });
    await add(page, { title: "Sparkasse", password: "Kessel-Pumpe-Rohr-7!" });
    await toList(page);
    const list = visible(page, "link", /^Zum Ändern/);
    await expect(list).toContainText("3");
    await list.click();
    await expect(page.getByRole("option")).toHaveCount(3);
    await expect(option(page, "Sparkasse")).toHaveCount(0);

    await option(page, "NAS").click();
    const why = page.getByRole("note", { name: "Zum Ändern" });
    await expect(why).toContainText("Dasselbe Passwort steht in 2 Einträgen.");
    await expect(why).not.toContainText("schwach");
    await axe(page);
    await goInApp(page, "/to-change");
    await option(page, "Mail info@").click();
    await expect(why).toContainText("Das Passwort ist schwach");
    await expect(why).not.toContainText("Dasselbe Passwort");
  });
});
