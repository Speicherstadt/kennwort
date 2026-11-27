import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";
import { heading, openTeam, openVaults } from "./company.ts";
import { addEntry } from "./entries.ts";

// K-605: Jonas of Weber Haustechnik prints a QR label for a customer's heating, joins the customer's
// company Müller Elektro with his own account, switches between the companies and hands the vault
// over to Max, the customer, who then removes him
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const openSettings = async (page: Page, button: string, title: string) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("tab", { name: "Firma" }).click();
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(heading(page, title)).toBeVisible();
};

/** A login written into a vault chosen by name */
const addEntryTo = async (page: Page, vault: string, title: string, password: string) => {
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("form", { name: "Neuer Eintrag" });
  await dialog.getByLabel("Tresor").selectOption({ label: vault });
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByLabel("Passwort", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
};

test.describe("QR labels", { tag: "@phone" }, () => {
  test("Jonas prints a label for the heating's router: the code holds the entry's address only", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await setUpCompany(page);
    const entryId = await addEntry(page, {
      title: "Router Heizung Müller",
      username: "admin",
      password: "Kessel-Anlage-2026",
    });
    await page.getByRole("button", { name: "Weitere Aktionen" }).filter({ visible: true }).click();
    await page.getByRole("menuitem", { name: "Etikett" }).click();
    const dialog = page.getByRole("dialog", { name: "QR-Etikett drucken" });
    await expect(dialog.getByLabel("Beschriftung")).toHaveValue("Router Heizung Müller");
    await dialog.getByLabel("Größe").selectOption({ label: "89 × 36 mm" });
    const code = dialog.getByRole("img", { name: "QR-Code zum Eintrag" });
    const link = (await code.getAttribute("data-link")) ?? "";
    expect(link).toMatch(new RegExp(`^http://localhost:5176/vaults/[A-Za-z0-9_-]{22}/${entryId}$`));
    expect(link).not.toContain("Kessel");
    expect(link).not.toContain("admin");
    await axe(page);
    await dialog.getByRole("button", { name: "Drucken" }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    // In print only the label shows, in the size chosen
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".kennwort-print .label-89x36")).toBeVisible();
    await expect(page.locator("#root")).toBeHidden();
    await page.emulateMedia({ media: "screen" });
    await expect(page.locator(".kennwort-print")).toBeHidden();
    // A camera opens the address: locked first, the entry after unlocking
    await page.goto(link);
    await expect(heading(page, "Kennwort ist gesperrt")).toBeVisible();
    await unlock(page);
    await expect(heading(page, "Router Heizung Müller")).toBeVisible();
  });
});

test.describe("several companies and the handover", { tag: "@phone" }, () => {
  test("Jonas joins Müller Elektro, switches companies and hands the vault Heizung over to Max", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    // Max sets up his company Müller Elektro and invites Jonas, his heating installer
    const max = await newDevice(browser);
    await setUpCompany(max, "Max Elektro Kabel Schalter");
    await openTeam(max, "Mitglieder");
    await max.getByLabel("Name", { exact: true }).fill("Jonas");
    await max.getByRole("button", { name: "Einladen" }).click();
    const invitation = await max.getByLabel("Einladungslink").inputValue();

    // Jonas runs Weber Haustechnik and keeps the heating's passwords in the vault Heizung Müller
    await setUpCompany(page);
    await openVaults(page);
    await page.getByLabel("Name", { exact: true }).fill("Heizung Müller");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await expect(page.getByRole("main").getByRole("list")).toContainText("Heizung Müller");
    await page.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
    await addEntryTo(page, "Heizung Müller", "Router Heizung", "Kessel-Anlage-2026");

    // He joins Müller Elektro with his own account: no new passphrase, no recovery kit
    await openSettings(page, "Firmen", "Firmen");
    await page.getByLabel("Name der Firma").first().fill("Müller Elektro");
    await page.getByLabel("Einladungslink").fill(invitation);
    await page.getByRole("button", { name: "Beitreten" }).click();
    await expect(heading(page, "Alle Einträge")).toBeVisible({ timeout: 30_000 });
    await openSettings(page, "Firmen", "Firmen");
    const companies = page.getByRole("list", { name: "Firmen" });
    await expect(
      companies.getByRole("listitem").filter({ hasText: "Müller Elektro" }),
    ).toContainText("Aktiv");
    await expect(page.getByText("Firmen hinzufügen und entfernen kannst du")).toBeVisible();
    await axe(page);

    // Max confirms Jonas's keys in his company
    await openTeam(max, "Mitglieder");
    const jonasRow = max
      .getByRole("list", { name: "Mitglieder" })
      .getByRole("listitem")
      .filter({ hasText: "Jonas" });
    await jonasRow.getByRole("button", { name: "Bestätigen" }).click();
    await expect(jonasRow).toContainText("Bestätigt");

    // Back in his own company, Jonas hands the vault over to Müller Elektro
    await page.getByRole("button", { name: "Zu Eigene Firma wechseln" }).click();
    await expect(heading(page, "Alle Einträge")).toBeVisible({ timeout: 30_000 });
    await openVaults(page);
    await page.getByRole("button", { name: "Heizung Müller an einen Kunden übergeben" }).click();
    const start = page.getByRole("dialog", { name: "Heizung Müller übergeben" });
    await expect(start).toContainText("1 Eintrag wird übergeben.");
    await start.getByLabel("Müller Elektro").check();
    await start.getByRole("button", { name: "Weiter" }).click();
    const finish = page.getByRole("dialog", { name: "Heizung Müller übernehmen lassen" });
    await expect(finish).toBeVisible({ timeout: 30_000 });
    await finish.getByLabel("Ohne Namen").check();
    await expect(finish).toContainText("„Bearbeiten“");
    await finish.getByRole("button", { name: "Übergeben" }).click();
    await expect(finish).toBeHidden({ timeout: 30_000 });
    await expect(heading(page, "Heizung Müller")).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Router Heizung");
    await openVaults(page);
    const jonasVault = page
      .getByRole("main")
      .getByRole("list")
      .getByRole("listitem")
      .filter({ hasText: "Heizung Müller" });
    await expect(jonasVault).toContainText("Bearbeiten");

    // Max manages the vault now and sees the entry, encrypted for him on Jonas's device
    await openVaults(max);
    const maxVault = max
      .getByRole("main")
      .getByRole("list")
      .getByRole("listitem")
      .filter({ hasText: "Heizung Müller" });
    await expect(maxVault).toContainText("Verwalten");
    await maxVault.getByRole("link", { name: /Heizung Müller/ }).click();
    await expect(max.getByRole("main")).toContainText("Router Heizung");

    // Max ends Jonas's access: removed with a new key, the vault is gone for Jonas
    await openVaults(max);
    await max.getByRole("button", { name: "Mitglieder von Heizung Müller" }).click();
    const members = max.getByRole("region", { name: "Mitglieder von Heizung Müller" });
    await members.getByRole("button", { name: "Jonas aus dem Tresor entfernen" }).click();
    await expect(
      members.getByRole("list", { name: "Mitglieder des Tresors" }).getByRole("listitem"),
    ).toHaveCount(1);
    await openVaults(page);
    await expect(page.getByRole("main").getByRole("list")).not.toContainText("Heizung Müller");

    // His own company still has its vault; the switch in the sidebar leads back to it
    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("tab", { name: "Firma" }).click();
    await page.getByRole("button", { name: "Firmen", exact: true }).click();
    await page.getByRole("button", { name: "Zu Eigene Firma wechseln" }).click();
    await expect(heading(page, "Alle Einträge")).toBeVisible({ timeout: 30_000 });
    await openVaults(page);
    await expect(page.getByRole("main").getByRole("list")).toContainText("Heizung Müller");
  });
});
