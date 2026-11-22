// Weber Haustechnik in the browser (K-305, K-306): pages and people the e2e tests share
import { type Browser, expect, type Page } from "@playwright/test";
import { newDevice } from "./account.ts";

export const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

export const openVaults = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Tresore" }).click();
  await expect(heading(page, "Tresore")).toBeVisible();
};

/**
 * Jonas invites Anna, she accepts on her own device, Jonas confirms her keys; `onKit` reads her
 * recovery kit while it shows
 */
export const annaJoins = async (
  page: Page,
  browser: Browser,
  onKit: (anna: Page) => Promise<void> = async () => {},
) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Mitglieder" }).click();
  await page.getByLabel("Name").fill("Anna");
  await page.getByRole("button", { name: "Einladen" }).click();
  const link = await page.getByLabel("Einladungslink").inputValue();
  const anna = await newDevice(browser);
  await anna.goto(link);
  await anna.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
  await anna.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
  await anna.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(heading(anna, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
  await onKit(anna);
  await anna.getByRole("checkbox").check();
  await anna.getByRole("button", { name: "Weiter" }).click();
  await expect(heading(anna, "Alle Einträge")).toBeVisible();
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Mitglieder" }).click();
  const row = page
    .getByRole("list", { name: "Mitglieder" })
    .getByRole("listitem")
    .filter({ hasText: "Anna" });
  await row.getByRole("button", { name: "Bestätigen" }).click();
  await expect(row).toContainText("Bestätigt");
  return anna;
};
