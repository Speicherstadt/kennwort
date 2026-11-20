import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test } from "./account.ts";

// K-304 part 2 (P-08): Jonas invites Anna from the members page, Anna accepts, Jonas confirms her
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const openMembers = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Mitglieder" }).click();
  await expect(heading(page, "Mitglieder")).toBeVisible();
  return page.getByRole("list", { name: "Mitglieder" });
};

test.describe("members", { tag: "@phone" }, () => {
  test("Jonas invites Anna by link, Anna accepts, Jonas confirms her keys", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    let members = await openMembers(page);
    await expect(members.getByRole("listitem")).toHaveCount(1);
    await expect(members.getByRole("listitem").first()).toContainText("Inhaber");
    await expect(members.getByRole("listitem").first()).toContainText("Bestätigt");

    await page.getByLabel("Name").fill("Anna");
    await page.getByRole("button", { name: "Einladen" }).click();
    const link = await page.getByLabel("Einladungslink").inputValue();
    expect(link).toMatch(/\/invite\/[\w-]{22}#token=.+&s=[\w-]{43}&root=[\w-]{43}$/);
    await axe(page);

    const anna = await newDevice(browser);
    await anna.goto(link);
    await expect(heading(anna, "Einladung annehmen")).toBeVisible();
    await anna.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
    await anna.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
    await anna.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(heading(anna, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    await anna.getByRole("checkbox").check();
    await anna.getByRole("button", { name: "Weiter" }).click();
    await expect(heading(anna, "Alle Einträge")).toBeVisible();

    // Anna's page shows her waiting, without a form to invite
    const seenByAnna = await openMembers(anna);
    await expect(seenByAnna.getByRole("listitem").filter({ hasText: "Anna" })).toContainText(
      "Wartet auf Bestätigung",
    );
    await expect(anna.getByRole("button", { name: "Einladen" })).toHaveCount(0);

    members = await openMembers(page);
    const annaRow = members.getByRole("listitem").filter({ hasText: "Anna" });
    await expect(annaRow).toContainText("Mitarbeiter");
    await annaRow.getByRole("button", { name: "Bestätigen" }).click();
    await expect(annaRow).toContainText("Bestätigt");
    await axe(page);

    // Anna's devices see her confirmed too, checked against the company key from her link
    await openMembers(anna);
    await expect(
      anna
        .getByRole("list", { name: "Mitglieder" })
        .getByRole("listitem")
        .filter({ hasText: "Anna" }),
    ).toContainText("Bestätigt");
  });
});
