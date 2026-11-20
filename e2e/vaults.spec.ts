import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";

// K-305 part 2 (P-05, P-06): Jonas gets his personal vault and creates a shared one for the office
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const openVaults = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Tresore" }).click();
  await expect(heading(page, "Tresore")).toBeVisible();
};

test.describe("vaults", { tag: "@phone" }, () => {
  test("Jonas finds his personal vault and creates the vault Büro, which stays after unlocking", async ({
    page,
  }) => {
    await setUpCompany(page);
    await openVaults(page);
    const list = page.getByRole("main").getByRole("list");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("listitem").first()).toContainText("Persönlich");
    await expect(list.getByRole("listitem").first()).toContainText("Verwalten");

    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText("Büro");
    await axe(page);

    // The names come from the server sealed: after reloading they open again
    await page.reload();
    await unlock(page);
    await openVaults(page);
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await list.getByRole("link", { name: /Büro/ }).click();
    await expect(heading(page, "Büro")).toBeVisible();
  });
});

test("the desktop sidebar lists the vaults and leads to all of them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setUpCompany(page);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "Persönlich" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Alle Tresore" }).click();
  await expect(heading(page, "Tresore")).toBeVisible();
});
