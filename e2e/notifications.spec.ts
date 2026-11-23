import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openVaults } from "./company.ts";

// K-602 (P-24): what happens to one account shows up in the bell of the other, live, by IDs the
// device names itself; marking it read clears the count. Push is tested on the server only
// (apps/server/src/notifications/routes.test.ts): a browser under Playwright gets no real push.
test.use({ locale: "de-DE" });

const bell = (page: Page) =>
  page.getByRole("link", { name: /^Mitteilungen/ }).filter({ visible: true });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

test.describe("notifications", { tag: "@phone" }, () => {
  test("Jonas hears that Anna accepted his invitation and asked for access to Büro", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    await expect(bell(page)).toHaveAccessibleName("Mitteilungen");
    const anna = await annaJoins(page, browser);
    // Live, without reloading: the stream said something is new, the app loaded the list
    await expect(bell(page)).toHaveAccessibleName("Mitteilungen, 1 ungelesen");
    await bell(page).click();
    await expect(heading(page, "Mitteilungen")).toBeVisible();
    const list = page.getByRole("list", { name: "Mitteilungen" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Anna hat deine Einladung angenommen.");
    await axe(page);
    await list.getByRole("button", { name: "Gelesen" }).click();
    await expect(bell(page)).toHaveAccessibleName("Mitteilungen");
    await expect(page.getByRole("button", { name: "Alle gelesen" })).toHaveCount(0);

    // Anna asks for access to Büro; Jonas's device names the vault and Anna itself
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("main").getByRole("link", { name: /Büro/ }).click();
    const link = page.url();
    await anna.goto(link);
    await unlock(anna, "Anna Heizung Bad Fliese");
    await anna.getByRole("button", { name: "Zugriff anfragen" }).click();
    await expect(anna.getByRole("main").getByRole("status")).toContainText("bei den Verwaltern");

    await expect(bell(page)).toHaveAccessibleName("Mitteilungen, 1 ungelesen");
    await bell(page).click();
    const request = list.getByRole("listitem").first();
    await expect(request).toContainText("Anna bittet um Zugriff auf Büro.");
    // Following it opens the vaults, where the request waits, and counts as read
    await request.getByRole("link").click();
    await expect(heading(page, "Tresore")).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Mitteilungen");

    // Deleting leaves only the older one; the push switch says what this browser offers
    await bell(page).click();
    await list
      .getByRole("listitem")
      .first()
      .getByRole("button", { name: "Mitteilung löschen" })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Push-Mitteilungen auf diesem Gerät" }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: "Zugriffsanfragen" })).toBeChecked();
  });
});
