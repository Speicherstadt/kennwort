import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, PASSPHRASE, SETUP_CODE, setUpCompany, test, unlock } from "./account.ts";

// K-303 part 2: set up, keep the kit, lock, unlock, accept an invitation, against a real server
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

test.describe("an account", { tag: "@phone" }, () => {
  test("a first owner sets up the company, keeps the kit, locks and unlocks", async ({ page }) => {
    await page.goto("/");
    await expect(heading(page, "Willkommen bei Kennwort")).toBeVisible();
    await axe(page);
    await page.getByRole("button", { name: "Firma anlegen" }).click();
    await expect(heading(page, "Firma anlegen")).toBeVisible();
    await axe(page);
    await page.getByLabel("Einrichtungs-Code").fill(SETUP_CODE);
    await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await page.getByLabel("Passphrase wiederholen").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Firma anlegen" }).click();

    await expect(heading(page, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("secret-key")).toHaveText(/^K1-/);
    await expect(page.getByTestId("account-id")).toHaveText(/^[\w-]{22}$/);
    await axe(page);
    const next = page.getByRole("button", { name: "Weiter" });
    await expect(next).toBeDisabled();
    await page.getByLabel("Ich habe das Recovery-Kit sicher aufbewahrt.").check();
    await next.click();
    await expect(heading(page, "Alle Einträge")).toBeVisible();

    // The rail on the desktop, the settings on a phone
    const lock = page.getByRole("button", { name: "Sperren" }).filter({ visible: true });
    if ((await lock.count()) === 0)
      await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).click();
    // Unlocking returns to the page that was locked
    const where = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
    await lock.first().click();
    await expect(heading(page, "Kennwort ist gesperrt")).toBeVisible();
    await expect(page.getByLabel("Secret Key")).toHaveCount(0);
    await axe(page);
    await page.getByLabel("Passphrase").fill("Pumpe Kessel Rohr Falsch");
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(heading(page, where)).toBeVisible({ timeout: 20_000 });
  });

  test("the kit saves as a PDF with every key, and its link fills in a new device", async ({
    page,
    browser,
  }) => {
    await page.goto("/setup");
    await page.getByLabel("Einrichtungs-Code").fill(SETUP_CODE);
    await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await page.getByLabel("Passphrase wiederholen").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Firma anlegen" }).click();
    await expect(heading(page, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    const accountId = (await page.getByTestId("account-id").textContent()) ?? "";
    const secretKey = (await page.getByTestId("secret-key").textContent()) ?? "";
    const recoveryKey = (await page.getByTestId("recovery-key").textContent()) ?? "";

    const saving = page.waitForEvent("download");
    await page.getByRole("button", { name: "Als PDF speichern" }).click();
    const download = await saving;
    expect(download.suggestedFilename()).toBe("kennwort-recovery-kit.pdf");
    const pdf = (await readFile((await download.path()) ?? "")).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    for (const value of [accountId, secretKey, recoveryKey, new URL(page.url()).origin])
      expect(pdf).toContain(`(${value})`);

    // What the QR code opens on a new device: account ID and Secret Key filled in from the fragment
    const other = await newDevice(browser);
    await other.goto(`/unlock#${new URLSearchParams({ account: accountId, secret: secretKey })}`);
    await expect(other.getByLabel("Konto-ID")).toHaveValue(accountId);
    await expect(other.getByLabel("Secret Key")).toHaveValue(secretKey);
    await axe(other);
    await other.getByLabel("Passphrase").fill(PASSPHRASE);
    await other.getByRole("button", { name: "Entsperren" }).click();
    await expect(heading(other, "Alle Einträge")).toBeVisible({ timeout: 20_000 });
    // The fragment with the Secret Key does not stay in the address or the history entry
    expect(new URL(other.url()).hash).toBe("");
    expect(new URL(other.url()).pathname).toBe("/entries");
  });

  test("a wrong setup code is refused", async ({ page }) => {
    await page.goto("/setup");
    await page.getByLabel("Einrichtungs-Code").fill("falscher-code-falscher-code");
    await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await page.getByLabel("Passphrase wiederholen").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Firma anlegen" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(heading(page, "Firma anlegen")).toBeVisible();
  });

  test("a new device unlocks with account ID, Secret Key and passphrase", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const accountId = JSON.parse(
      await page.evaluate(() => localStorage.getItem("kennwort-device") ?? "{}"),
    ).accountId;
    const secretKey = JSON.parse(
      await page.evaluate(() => localStorage.getItem("kennwort-device") ?? "{}"),
    ).secretKey;
    const other = await newDevice(browser);
    await other.goto("/entries");
    await other.getByRole("button", { name: "Anderes Konto" }).click();
    await other.getByLabel("Konto-ID").fill(accountId);
    await other.getByLabel("Secret Key").fill(secretKey);
    await other.getByLabel("Passphrase").fill(PASSPHRASE);
    await other.getByRole("button", { name: "Entsperren" }).click();
    await expect(heading(other, "Alle Einträge")).toBeVisible({ timeout: 20_000 });
    // The device remembers the account: the next time it asks for the passphrase only
    await other.reload();
    await expect(other.getByLabel("Konto-ID")).toHaveCount(0);
    await unlock(other);
    await expect(heading(other, "Alle Einträge")).toBeVisible();
  });

  test("an invited member accepts the link and gets a kit", async ({ page, browser, request }) => {
    const owner = await setUpCompany(page);
    const made = await request.post("/api/invitations", {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(made.status()).toBe(201);
    const { id, token } = (await made.json()) as { id: string; token: string };
    // The owner's screen for inviting (K-304) puts the root fingerprint in the link; here any will do
    const root = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
    const member = await newDevice(browser);
    await member.goto(`/invite/${id}#token=${token}&root=${root}`);
    await expect(heading(member, "Einladung annehmen")).toBeVisible();
    await axe(member);
    await member.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
    await member.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
    await member.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(heading(member, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    await member.getByRole("checkbox").check();
    await member.getByRole("button", { name: "Weiter" }).click();
    await expect(heading(member, "Alle Einträge")).toBeVisible();
    // The link is used up
    const again = await newDevice(browser);
    await again.goto(`/invite/${id}#token=${token}&root=${root}`);
    await again.getByLabel("Passphrase", { exact: true }).fill("Max Werkstatt Rohr Zange");
    await again.getByLabel("Passphrase wiederholen").fill("Max Werkstatt Rohr Zange");
    await again.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(again.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  });

  test("the app locks itself after ten minutes without use", async ({ page }) => {
    await page.clock.install();
    await setUpCompany(page);
    await page.clock.fastForward("09:00");
    await page.keyboard.press("Shift");
    await page.clock.fastForward("09:00");
    await expect(heading(page, "Alle Einträge")).toBeVisible();
    await page.clock.fastForward("01:01");
    await expect(heading(page, "Kennwort ist gesperrt")).toBeVisible();
  });
});
