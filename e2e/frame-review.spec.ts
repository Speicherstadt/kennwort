import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./account.ts";
import { addEntry, goInApp, unique } from "./entries.ts";

// Regressions from the review of K-302, with entries from the vaults (K-306)
test.use({ locale: "de-DE" });

test("a password revealed on one entry is not shown on the next entry", async ({ page, open }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open("/entries");
  const mail = unique("Mail info@");
  await addEntry(page, { title: mail, password: "sommer2019" });
  await addEntry(page, { title: unique("Sparkasse"), password: "Weber-2026!" });
  await page.getByRole("button", { name: "Passwort aufdecken" }).click();
  await expect(page.getByText("Weber-2026!")).toBeVisible();
  await page.getByRole("option", { name: new RegExp(mail) }).click();
  await expect(page.getByRole("heading", { level: 1, name: mail })).toBeVisible();
  // No user action on this entry: its password must stay hidden
  await expect(page.getByText("sommer2019")).toBeHidden();
  await expect(page.getByRole("button", { name: "Passwort aufdecken" })).toBeVisible();
});

const axeIds = async (page: import("@playwright/test").Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );

test("a search that hides the selected entry leaves valid ARIA", async ({ page, open }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open("/entries");
  const wlan = unique("WLAN Büro");
  await addEntry(page, { title: wlan });
  await addEntry(page, { title: unique("Sparkasse") });
  await page.getByRole("searchbox").first().fill(wlan);
  await expect(page.getByRole("option", { name: new RegExp(wlan) })).toBeVisible();
  expect(await axeIds(page)).toEqual([]);
});

test("an entry outside the list's filter leaves valid ARIA", async ({ page, open }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open("/entries");
  const wlan = unique("WLAN Büro");
  const id = await addEntry(page, { title: wlan });
  await goInApp(page, `/favorites/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Favoriten" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: wlan })).toBeVisible();
  expect(await axeIds(page)).toEqual([]);
});
