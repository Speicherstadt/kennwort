import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./account.ts";
import { addEntry, unique } from "./entries.ts";

// K-302: every page opens on the desktop and on a phone, in light and dark, and axe finds nothing
test.use({ locale: "de-DE" });

const pages = [
  { path: "/entries", title: "Alle Einträge" },
  { path: "/favorites", title: "Favoriten" },
  { path: "/to-change", title: "Zum Ändern" },
  { path: "/vaults/office", title: "Büro" },
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

test.describe("an entry", { tag: "@phone" }, () => {
  for (const scheme of ["light", "dark"] as const)
    test(`opens in ${scheme} and axe finds nothing`, async ({ page, open }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open("/entries");
      const title = unique("Sparkasse");
      await addEntry(page, {
        title,
        username: "jonas",
        password: "Weber-2026!",
        website: "https://sparkasse.de",
      });
      await axe(page);
    });
});

test("the desktop shows rail, sidebar, list and detail side by side", async ({ page, open }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open("/entries");
  const first = unique("A Sparkasse");
  await addEntry(page, { title: unique("B Tablet") });
  await addEntry(page, { title: first });
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Bereiche" })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Alle Einträge" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: first })).toBeVisible();
  const at = page.url();
  await page.getByRole("listbox", { name: "Alle Einträge" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page).not.toHaveURL(at);
  await expect(page).toHaveURL(/\/entries\/[\w-]{22}$/);
  await page.getByRole("link", { name: "Zum Ändern" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zum Ändern" })).toBeVisible();
});

test("a phone shows one screen at a time with the tab bar @phone", async ({ page, open }) => {
  // A phone's width in both projects, so the desktop run checks the narrow layout too
  await page.setViewportSize({ width: 412, height: 839 });
  await open("/entries");
  await expect(page.getByRole("complementary", { name: "Bereiche" })).toBeHidden();
  const title = unique("Sparkasse");
  const id = await addEntry(page, { title });
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Alle Einträge" })).toBeVisible();
  await page.getByRole("option", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(new RegExp(`/entries/${id}$`));
  await expect(page.getByRole("listbox", { name: "Alle Einträge" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await page.getByRole("link", { name: "Zurück" }).click();
  await page.getByRole("link", { name: /Zum Ändern · 0/ }).click();
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
