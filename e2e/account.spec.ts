import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
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

/**
 * An invitation as the owner's screen makes it (K-304 part 2), which also seals the secret and puts
 * the root fingerprint in the link; here any will do, the server cannot tell. A new ID each run:
 * desktop and phone share one server.
 */
const invite = async (request: APIRequestContext, ownerToken: string) => {
  const id = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const made = await request.post("/api/invitations", {
    headers: { authorization: `Bearer ${ownerToken}` },
    data: { id, sealedSecret: "A".repeat(98), label: "Anna" },
  });
  expect(made.status()).toBe(201);
  const { token } = (await made.json()) as { token: string };
  const root = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
  const secret = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI";
  return { id, token, link: `/invite/${id}#token=${token}&s=${secret}&root=${root}` };
};

/** The address is `path` without a fragment, and the history entry holds nothing of the link */
const expectNoSecretIn = async (page: Page, path: string, token: string) => {
  await expect.poll(() => new URL(page.url()).pathname).toBe(path);
  expect(new URL(page.url()).hash).toBe("");
  const kept = await page.evaluate(() => location.href + JSON.stringify(history.state));
  expect(kept).not.toContain(token);
  expect(kept).not.toContain("AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI");
};

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
    const lock = page
      .getByRole("button", { name: "Sperren", exact: true })
      .filter({ visible: true });
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

  test("a forgotten passphrase is replaced with the Recovery Key, and the old key no longer signs in", async ({
    page,
    browser,
  }) => {
    const owner = await setUpCompany(page);
    const { accountId } = JSON.parse(owner.device) as { accountId: string };
    const lock = page
      .getByRole("button", { name: "Sperren", exact: true })
      .filter({ visible: true });
    if ((await lock.count()) === 0)
      await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).click();
    await lock.first().click();
    await page.getByRole("button", { name: "Passphrase vergessen?" }).click();
    await expect(heading(page, "Passphrase vergessen")).toBeVisible();
    await expect(page.getByLabel("Konto-ID")).toHaveValue(accountId);
    await axe(page);
    await page.getByLabel("Recovery Key").fill(owner.recoveryKey);
    await page.getByLabel("Passphrase", { exact: true }).fill("Rohr Zange Ventil Kessel");
    await page.getByLabel("Passphrase wiederholen").fill("Rohr Zange Ventil Kessel");
    await page.getByRole("button", { name: "Neue Passphrase festlegen" }).click();
    await expect(heading(page, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    // Same device, same Secret Key; a new Recovery Key
    await expect(page.getByTestId("secret-key")).toHaveText(owner.secretKey);
    const renewed = (await page.getByTestId("recovery-key").textContent()) ?? "";
    expect(renewed).not.toBe(owner.recoveryKey);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(heading(page, "Alle Einträge")).toBeVisible();

    // The old passphrase and the old Recovery Key no longer open anything
    const other = await newDevice(browser);
    await other.goto("/entries");
    await other.getByRole("button", { name: "Anderes Konto" }).click();
    await other.getByLabel("Konto-ID").fill(accountId);
    await other.getByLabel("Secret Key").fill(owner.secretKey);
    await other.getByLabel("Passphrase").fill(PASSPHRASE);
    await other.getByRole("button", { name: "Entsperren" }).click();
    await expect(other.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await other.getByLabel("Passphrase").fill("Rohr Zange Ventil Kessel");
    await other.getByRole("button", { name: "Entsperren" }).click();
    await expect(heading(other, "Alle Einträge")).toBeVisible({ timeout: 20_000 });
    const third = await newDevice(browser);
    await third.goto("/recover");
    await third.getByLabel("Konto-ID").fill(accountId);
    await third.getByLabel("Recovery Key").fill(owner.recoveryKey);
    await third.getByLabel("Passphrase", { exact: true }).fill("Noch eine neue Passphrase");
    await third.getByLabel("Passphrase wiederholen").fill("Noch eine neue Passphrase");
    await third.getByRole("button", { name: "Neue Passphrase festlegen" }).click();
    await expect(third.getByRole("alert")).toHaveText("Konto-ID oder Recovery Key stimmt nicht.", {
      timeout: 20_000,
    });
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
    const { id, link, token } = await invite(request, owner.token);
    const member = await newDevice(browser);
    await member.goto(link);
    await expect(heading(member, "Einladung annehmen")).toBeVisible();
    // The secret leaves the address and the history entry before anything renders (P-08)
    await expectNoSecretIn(member, `/invite/${id}`, token);
    await axe(member);
    await member.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
    await member.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
    await member.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(heading(member, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    await member.getByRole("checkbox").check();
    await member.getByRole("button", { name: "Weiter" }).click();
    await expect(heading(member, "Alle Einträge")).toBeVisible();
    // Back to the invitation's entry: it holds no fragment either
    await member.goBack();
    await expectNoSecretIn(member, `/invite/${id}`, token);
    // The link is used up
    const again = await newDevice(browser);
    await again.goto(link);
    await again.getByLabel("Passphrase", { exact: true }).fill("Max Werkstatt Rohr Zange");
    await again.getByLabel("Passphrase wiederholen").fill("Max Werkstatt Rohr Zange");
    await again.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(again.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  });

  test("an invitation opened in the tab already on the invitation's page is taken and dropped", async ({
    page,
    browser,
    request,
  }) => {
    const owner = await setUpCompany(page);
    const { id, link, token } = await invite(request, owner.token);
    const member = await newDevice(browser);
    await member.goto(`/invite/${id}`);
    await expect(member.getByRole("alert")).toHaveText("Dieser Einladungslink ist unvollständig.");
    // Only the fragment changes: the browser does not load the page anew
    await member.evaluate(() => {
      (window as unknown as { samePage: boolean }).samePage = true;
    });
    await member.goto(link);
    await expect(member.getByRole("button", { name: "Konto anlegen" })).toBeVisible();
    await expect(member.getByRole("alert")).toHaveCount(0);
    expect(await member.evaluate(() => "samePage" in window)).toBe(true);
    await expectNoSecretIn(member, `/invite/${id}`, token);
    await member.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
    await member.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
    await member.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(heading(member, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
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
