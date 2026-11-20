import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./account.ts";

// K-302: every page opens on the desktop and on a phone, in light and dark, and axe finds nothing
test.use({ locale: "de-DE" });

const pages = [
  { path: "/entries", title: "Alle Einträge" },
  { path: "/favorites", title: "Favoriten" },
  { path: "/to-change", title: "Zum Ändern" },
  { path: "/vaults/office", title: "Büro" },
  { path: "/entries/bank", title: "Sparkasse" },
  { path: "/generator", title: "Generator" },
  { path: "/groups", title: "Gruppen" },
  { path: "/settings", title: "Einstellungen" },
  { path: "/nope", title: "Diese Seite gibt es nicht" },
];

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

test.describe("every page", { tag: "@phone" }, () => {
  for (const scheme of ["light", "dark"] as const)
    for (const { path, title } of pages)
      test(`${path} opens in ${scheme} and axe finds nothing`, async ({ page, open }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(path);
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
        await axe(page);
      });
});

test("the desktop shows rail, sidebar, list and detail side by side", async ({ page, open }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open("/entries/bank");
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Bereiche" })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Alle Einträge" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Sparkasse" })).toBeVisible();
  await page.getByRole("listbox", { name: "Alle Einträge" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/entries\/tablet$/);
  await page.getByRole("link", { name: "Zum Ändern" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zum Ändern" })).toBeVisible();
});

test("a phone shows one screen at a time with the tab bar @phone", async ({ page, open }) => {
  // A phone's width in both projects, so the desktop run checks the narrow layout too
  await page.setViewportSize({ width: 412, height: 839 });
  await open("/entries");
  await expect(page.getByRole("complementary", { name: "Bereiche" })).toBeHidden();
  await page.getByRole("option", { name: /Sparkasse/ }).click();
  await expect(page).toHaveURL(/\/entries\/bank$/);
  await expect(page.getByRole("listbox", { name: "Alle Einträge" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Sparkasse" })).toBeVisible();
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Alle Einträge" })).toBeVisible();
  await page.getByRole("link", { name: /Zum Ändern · 2/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zum Ändern" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Hauptnavigation" });
  await tabs.getByRole("link", { name: "Einstellungen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  await page.getByRole("radio", { name: "Dunkel" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switching the language in the settings changes the texts", async ({ page, open }) => {
  await open("/settings");
  await page.getByRole("radio", { name: "English" }).check();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});
