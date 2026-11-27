// Weber Haustechnik in the browser (K-305, K-306, K-608): pages, people and vault helpers
import { type Browser, expect, type Page } from "@playwright/test";
import { newDevice } from "./account.ts";

export const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

/** The team page (rail on the desktop, tab bar on the phone) on one of its tabs */
export const openTeam = async (page: Page, tab: "Mitglieder" | "Tresore") => {
  await page
    .getByRole("link", { name: "Team", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("navigation", { name: "Team" }).getByRole("link", { name: tab }).click();
  if (tab === "Tresore") {
    await expect(page.getByRole("navigation", { name: "Tresore" })).toBeVisible();
  } else {
    await expect(heading(page, tab)).toBeVisible();
  }
};

export const openVaults = (page: Page) => openTeam(page, "Tresore");

/** Creates a shared vault from Team → Vaults via the "Neuer Tresor" dialog and returns its URL */
export const createVault = async (page: Page, name: string) => {
  const nav = page.getByRole("navigation", { name: "Tresore" });
  if (!(await nav.isVisible())) {
    const back = page.getByRole("button", { name: "Zurück zu den Tresoren" });
    if (await back.isVisible()) await back.click();
  }
  await nav.getByRole("button", { name: "Neuer Tresor" }).click();
  const dialog = page.getByRole("dialog", { name: "Neuer Tresor" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  const created = page.waitForRequest(
    (r) => r.method() === "POST" && /\/api\/vaults\/[^/]+\/log$/.test(r.url()),
  );
  await dialog.getByRole("button", { name: "Tresor anlegen" }).click();
  const req = await created;
  const vaultId = req.url().match(/\/api\/vaults\/([^/]+)\/log$/)?.[1] ?? "";
  await expect(dialog).toBeHidden();
  await expect(nav.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  return `${new URL(page.url()).origin}/vaults/${vaultId}`;
};

/** Selects a vault in Team → Vaults (works on desktop, tablet and phone) */
export const selectVault = async (page: Page, name: string) => {
  const nav = page.getByRole("navigation", { name: "Tresore" });
  if (!(await nav.isVisible())) {
    const back = page.getByRole("button", { name: "Zurück zu den Tresoren" });
    if (await back.isVisible()) await back.click();
  }
  await nav.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
};

/** Adds one or more confirmed people to the currently open vault (desktop combobox or phone sheet) */
export const addVaultMembers = async (
  page: Page,
  names: string[],
  role: "Lesen" | "Bearbeiten" | "Verwalten" = "Lesen",
  until?: string,
) => {
  const mobileBtn = page.getByRole("button", { name: "Personen hinzufügen" });
  if (await mobileBtn.isVisible()) {
    await mobileBtn.click();
    const sheet = page.getByRole("dialog", { name: "Personen hinzufügen" });
    for (const name of names) {
      await sheet.getByRole("checkbox", { name: new RegExp(name) }).check();
    }
    await sheet.getByRole("radiogroup", { name: "Rolle" }).getByText(role, { exact: true }).click();
    await sheet.getByRole("button", { name: /hinzufügen/i }).click();
    await expect(sheet).toBeHidden();
    return;
  }
  const combo = page.getByRole("combobox", { name: "Person hinzufügen" });
  for (const name of names) {
    await combo.click();
    await combo.fill(name);
    await page.getByRole("option", { name: new RegExp(name) }).click();
  }
  if (role !== "Lesen") {
    await page.getByRole("button", { name: "Lesen" }).click();
    await page.getByRole("menuitemradio", { name: new RegExp(role) }).click();
  }
  if (until) {
    await page.getByRole("button", { name: "Befristen" }).click();
    await page.getByLabel("Zugriff bis").fill(until);
  }
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
};

/** Changes a member's role via their "⋯" menu */
export const changeVaultMemberRole = async (
  page: Page,
  name: string,
  role: "Lesen" | "Bearbeiten" | "Verwalten",
) => {
  await page
    .getByRole("button", { name: new RegExp(`^${name}.*: Rolle ändern oder entfernen`) })
    .click();
  await page.getByRole("menuitemradio", { name: new RegExp(role) }).click();
};

/** Removes a member via their "⋯" menu and confirms the destructive alertdialog */
export const removeVaultMember = async (page: Page, name: string) => {
  await page
    .getByRole("button", { name: new RegExp(`^${name}.*: Rolle ändern oder entfernen`) })
    .click();
  await page.getByRole("menuitem", { name: /entfernen/i }).click();
  const dlg = page.getByRole("alertdialog");
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Entfernen", exact: true }).click();
  await expect(dlg).toBeHidden();
};

/**
 * Jonas invites a person, they accept on their own device, and optionally Jonas confirms their keys
 */
export const personJoins = async (
  page: Page,
  browser: Browser,
  name: string,
  passphrase: string,
  options: { confirm?: boolean; onKit?: (device: Page) => Promise<void> } = {},
) => {
  const { confirm = true, onKit = async () => {} } = options;
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await openTeam(page, "Mitglieder");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Einladen" }).click();
  const link = await page.getByLabel("Einladungslink").inputValue();
  const device = await newDevice(browser);
  await device.goto(link);
  await device.getByLabel("Passphrase", { exact: true }).fill(passphrase);
  await device.getByLabel("Passphrase wiederholen").fill(passphrase);
  await device.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(heading(device, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
  await onKit(device);
  await device.getByRole("checkbox").check();
  await device.getByRole("button", { name: "Weiter" }).click();
  await expect(heading(device, "Alle Einträge")).toBeVisible();
  if (confirm) {
    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await openTeam(page, "Mitglieder");
    const row = page
      .getByRole("list", { name: "Mitglieder" })
      .getByRole("listitem")
      .filter({ hasText: name });
    await row.getByRole("button", { name: "Bestätigen" }).click();
    await expect(row).toContainText("Bestätigt");
  }
  return device;
};

export const annaJoins = (
  page: Page,
  browser: Browser,
  onKit: (anna: Page) => Promise<void> = async () => {},
) => personJoins(page, browser, "Anna", "Anna Heizung Bad Fliese", { confirm: true, onKit });
