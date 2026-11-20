import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, PASSPHRASE, setUpCompany, test, unlock } from "./account.ts";

// K-303 part 5 (P-04): a new device joins through an unlocked one, both see the same code
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

/** The new device: from the welcome page to the QR code; returns the link it shows */
const startPairing = async (device: Page) => {
  await device.goto("/");
  await device.getByRole("button", { name: "Mit einem anderen Gerät verbinden" }).click();
  await expect(heading(device, "Mit einem anderen Gerät verbinden")).toBeVisible();
  await expect(device.getByRole("img", { name: "QR-Code zum Verbinden" })).toBeVisible({
    timeout: 10_000,
  });
  return (await device.getByTestId("pairing-link").textContent()) ?? "";
};

/** Both devices show the same code; the new one agrees, the unlocked one confirms */
const compareAndConfirm = async (owner: Page, device: Page) => {
  const shown = owner.getByTestId("pairing-code");
  await expect(shown).toBeVisible({ timeout: 20_000 });
  const code = (await shown.textContent()) ?? "";
  expect(code).toMatch(/^\d{3} \d{3}$/);
  await expect(device.getByTestId("pairing-code")).toHaveText(code, { timeout: 20_000 });
  await axe(device);
  await device.getByRole("button", { name: "Code stimmt" }).click();
  await owner.getByRole("button", { name: "Code stimmt – Gerät hinzufügen" }).click();
  await expect(owner.getByText("Das Gerät ist hinzugefügt.")).toBeVisible();
  await expect(heading(device, "Alle Einträge")).toBeVisible({ timeout: 20_000 });
};

test.describe("adding a device", { tag: "@phone" }, () => {
  test("with the link pasted on the unlocked device; the new device unlocks with the passphrase later", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const device = await newDevice(browser);
    const link = await startPairing(device);
    expect(link).toMatch(/\/link#id=.+&fp=.+&r=.+/);
    await axe(device);

    const settings = page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true });
    await settings.first().click();
    await page.getByRole("button", { name: "Gerät hinzufügen" }).click();
    await expect(heading(page, "Gerät hinzufügen")).toBeVisible();
    await axe(page);
    await page.getByLabel("Link vom neuen Gerät").fill(link);
    await page.getByRole("button", { name: "Verbinden" }).click();
    await compareAndConfirm(page, device);

    // The device now knows the account: after a reload only the passphrase is asked
    await device.reload();
    await expect(device.getByLabel("Konto-ID")).toHaveCount(0);
    await unlock(device, PASSPHRASE);
    await expect(heading(device, "Alle Einträge")).toBeVisible();
  });

  test("with the link opened from the QR code on a locked device, after unlocking it", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const device = await newDevice(browser);
    const link = await startPairing(device);
    // A camera app opens the link: the page loads anew, so the account is locked first
    await page.goto(link);
    await expect(heading(page, "Kennwort ist gesperrt")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await unlock(page, PASSPHRASE);
    await expect(heading(page, "Gerät hinzufügen")).toBeVisible();
    await expect(page.getByLabel("Link vom neuen Gerät")).toHaveValue(new URL(link).hash);
    await page.getByRole("button", { name: "Verbinden" }).click();
    await compareAndConfirm(page, device);
  });

  test("refuses what is not a pairing link", async ({ page }) => {
    await setUpCompany(page);
    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Gerät hinzufügen" }).click();
    await page
      .getByLabel("Link vom neuen Gerät")
      .fill("https://example.org/link#id=x&fp=kurz&r=kurz");
    await page.getByRole("button", { name: "Verbinden" }).click();
    await expect(page.getByRole("alert")).toHaveText("Das ist kein Link zum Verbinden.");
  });
});
