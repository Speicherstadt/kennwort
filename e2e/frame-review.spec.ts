import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Regressions from the review of K-302
test.use({ locale: "de-DE" });

test("a password revealed on one entry is not shown on the next entry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/entries/bank");
  await page.getByRole("button", { name: "Passwort aufdecken" }).click();
  await expect(page.getByText("Weber-2026!")).toBeVisible();
  await page.getByRole("option", { name: /Mail info@/ }).click();
  await expect(page).toHaveURL(/\/entries\/mail$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mail info@" })).toBeVisible();
  // No user action on this entry: its password must stay hidden
  await expect(page.getByText("sommer2019")).toBeHidden();
  await expect(page.getByRole("button", { name: "Passwort aufdecken" })).toBeVisible();
});

const axeIds = async (page: import("@playwright/test").Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );

test("a search that hides the selected entry leaves valid ARIA", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/entries/bank");
  await page.getByRole("searchbox").first().fill("WLAN");
  await expect(page.getByRole("option", { name: /WLAN/ })).toBeVisible();
  expect(await axeIds(page)).toEqual([]);
});

test("an entry outside the list's filter leaves valid ARIA", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/favorites/wlan");
  await expect(page.getByRole("heading", { level: 1, name: "WLAN Büro" })).toBeVisible();
  expect(await axeIds(page)).toEqual([]);
});
