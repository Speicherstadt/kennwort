import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openTeam } from "./company.ts";

// K-307 part c (P-13): Jonas switches company recovery on, Anna deposits; she loses everything and
// gets her account back on a new device, which Jonas approves after comparing the code
test.use({ locale: "de-DE" });

const NEW_PASSPHRASE = "Anna Neu Heizung Fliese";

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const openMembers = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await openTeam(page, "Mitglieder");
  await expect(heading(page, "Mitglieder")).toBeVisible();
  return page.getByRole("region", { name: "Firmen-Recovery" });
};

test.describe("company recovery", { tag: "@phone" }, () => {
  test("Jonas switches it on, Anna deposits, loses everything and recovers on a new device", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await setUpCompany(page);
    const recovery = await openMembers(page);
    await expect(recovery).toContainText("Firmen-Recovery ist aus");
    await recovery.getByRole("button", { name: "Firmen-Recovery einschalten" }).click();
    await expect(recovery).toContainText("Firmen-Recovery ist an", { timeout: 20_000 });
    await expect(recovery.getByText("Dein Zugang ist hinterlegt.")).toBeVisible();
    await axe(page);

    // Anna joins after recovery is on; her client deposits once it opens her account
    const anna = await annaJoins(page, browser);
    const hers = await openMembers(anna);
    await expect(hers.getByText("Dein Zugang ist hinterlegt.")).toBeVisible({ timeout: 20_000 });
    await expect(hers.getByRole("button")).toHaveCount(0);

    // Passphrase, kit and device are gone: a new device asks the company
    const device = await newDevice(browser);
    await device.goto("/");
    await device
      .getByRole("button", { name: "Alles verloren? Über die Firma wiederherstellen" })
      .click();
    await expect(heading(device, "Zugang über die Firma wiederherstellen")).toBeVisible();
    await expect(device.getByRole("img", { name: "QR-Code zum Verbinden" })).toBeVisible({
      timeout: 10_000,
    });
    await axe(device);
    const link = (await device.getByTestId("pairing-link").textContent()) ?? "";

    // Jonas chooses Anna on the add-device page and compares the code with her
    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("tab", { name: "Geräte und Anmeldung" }).click();
    await page.getByRole("button", { name: "Gerät hinzufügen" }).click();
    await page.getByLabel("Link vom neuen Gerät").fill(link);
    await page.getByLabel("Gerät für").selectOption({ label: "Anna wiederherstellen" });
    await page.getByRole("button", { name: "Verbinden" }).click();
    const shown = page.getByTestId("pairing-code");
    await expect(shown).toBeVisible({ timeout: 20_000 });
    const code = (await shown.textContent()) ?? "";
    await expect(device.getByTestId("pairing-code")).toHaveText(code, { timeout: 20_000 });
    await device.getByRole("button", { name: "Code stimmt" }).click();
    await page.getByRole("button", { name: "Code stimmt – Zugang wiederherstellen" }).click();
    await expect(page.getByText("Der Zugang ist wiederhergestellt.")).toBeVisible();

    // Anna's device checked her account; she chooses a new passphrase and gets a new kit
    await expect(device.getByLabel("Passphrase", { exact: true })).toBeVisible({ timeout: 20_000 });
    await device.getByLabel("Passphrase", { exact: true }).fill(NEW_PASSPHRASE);
    await device.getByLabel("Passphrase wiederholen").fill(NEW_PASSPHRASE);
    await device.getByRole("button", { name: "Neue Passphrase festlegen" }).click();
    await expect(heading(device, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    await device.getByRole("checkbox").check();
    await device.getByRole("button", { name: "Weiter" }).click();
    await expect(heading(device, "Alle Einträge")).toBeVisible();

    // The device knows her account now and unlocks with the new passphrase
    await device.reload();
    await unlock(device, NEW_PASSPHRASE);
    await expect(heading(device, "Alle Einträge")).toBeVisible();
  });

  test("Jonas makes a new key, Anna deposits anew; switched off, nothing is deposited", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const recovery = await openMembers(page);
    await recovery.getByRole("button", { name: "Firmen-Recovery einschalten" }).click();
    await expect(recovery).toContainText("Firmen-Recovery ist an", { timeout: 20_000 });
    const anna = await annaJoins(page, browser);
    // A new key (an owner left): Anna deposits anew to it once her client sees the policy
    await openMembers(page);
    await recovery.getByRole("button", { name: "Neuen Recovery-Schlüssel anlegen" }).click();
    await expect(recovery.getByText("Gespeichert.", { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    const renewed = await openMembers(anna);
    await expect(renewed.getByText("Dein Zugang ist hinterlegt.")).toBeVisible({ timeout: 20_000 });
    await recovery.getByRole("button", { name: "Firmen-Recovery ausschalten" }).click();
    await expect(recovery).toContainText("Firmen-Recovery ist aus", { timeout: 20_000 });
    const hers = await openMembers(anna);
    await expect(hers).toContainText("Firmen-Recovery ist aus", { timeout: 20_000 });
    await expect(hers.getByText("Dein Zugang ist hinterlegt.")).toHaveCount(0);
  });
});
