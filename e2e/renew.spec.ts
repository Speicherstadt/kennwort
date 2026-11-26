import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openTeam, openVaults } from "./company.ts";

// K-307 part e (P-12): Anna's recovery kit got into other hands. She renews every key of her
// account; Jonas compares the code and confirms the new bundle; the vaults get a rekey entry and a
// new key. Her old Recovery Key opens nothing afterwards.
test.use({ locale: "de-DE" });

const ANNA = "Anna Heizung Bad Fliese";

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const visibleLink = (page: Page, name: string) =>
  page.getByRole("link", { name }).filter({ visible: true }).first();

const openSettings = (page: Page) => visibleLink(page, "Einstellungen").click();

/** A login in Büro, written through the app's dialog */
const loginInBuero = async (page: Page, title: string) => {
  await visibleLink(page, "Einträge").click();
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const editor = page.getByRole("form", { name: "Neuer Eintrag" });
  await editor.getByLabel("Tresor").selectOption({ label: "Büro" });
  await editor.getByLabel("Titel").fill(title);
  await editor.getByLabel("Passwort", { exact: true }).fill("Rohr-Ventil-Kessel-2026!");
  await editor.getByRole("button", { name: "Speichern" }).click();
  await expect(editor).toBeHidden();
  await expect(heading(page, title)).toBeVisible();
};

/** Jonas creates Büro with Anna as editor and writes the Sparkasse login */
const buero = async (page: Page, anna: Page) => {
  await openVaults(page);
  await page.getByLabel("Name", { exact: true }).fill("Büro");
  await page.getByRole("button", { name: "Tresor anlegen" }).click();
  await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
  const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
  await dialog.getByLabel("Person").selectOption({ label: "Anna" });
  await dialog.getByLabel("Rolle", { exact: true }).selectOption("edit");
  await dialog.getByRole("button", { name: "Aufnehmen" }).click();
  await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("edit");
  await dialog.getByRole("button", { name: "Schließen" }).click();
  await loginInBuero(page, "Sparkasse");
  await openVaults(anna);
  await visibleLink(anna, "Einträge").click();
  await expect(anna.getByRole("option", { name: /Sparkasse/ })).toBeVisible();
};

test.describe("renewing the account's keys", { tag: "@phone" }, () => {
  test("Anna renews her keys, Jonas confirms the code, the vaults get new keys and the old kit opens nothing", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await setUpCompany(page);
    let oldRecoveryKey = "";
    let accountId = "";
    const anna = await annaJoins(page, browser, async (kit) => {
      oldRecoveryKey = (await kit.getByTestId("recovery-key").textContent()) ?? "";
      accountId = (await kit.getByTestId("account-id").textContent()) ?? "";
    });
    await buero(page, anna);

    // Anna: Einstellungen → Schlüssel erneuern
    await openSettings(anna);
    await anna.getByRole("button", { name: "Schlüssel erneuern" }).click();
    await expect(heading(anna, "Schlüssel erneuern")).toBeVisible();
    await axe(anna);
    await anna.getByLabel("Passphrase").fill("Vertippt und falsch");
    await anna.getByRole("button", { name: "Schlüssel jetzt erneuern" }).click();
    await expect(anna.getByRole("alert")).toHaveText("Passphrase oder Secret Key stimmt nicht.", {
      timeout: 20_000,
    });
    const renewal = anna.waitForResponse(
      (r) => r.url().endsWith("/api/account/rekey") && r.request().method() === "PUT",
    );
    await anna.getByLabel("Passphrase").fill(ANNA);
    await anna.getByRole("button", { name: "Schlüssel jetzt erneuern" }).click();
    expect((await renewal).status()).toBe(200);
    const code = (await anna.getByTestId("renew-code").textContent()) ?? "";
    expect(code).toMatch(/^(\d{5} ){11}\d{5}$/);
    const newRecoveryKey = (await anna.getByTestId("recovery-key").textContent()) ?? "";
    expect(newRecoveryKey).not.toBe(oldRecoveryKey);
    await axe(anna);
    await anna.getByRole("checkbox").check();
    await anna.getByRole("button", { name: "Weiter" }).click();

    // Until the new bundle is confirmed she reads Büro, but nobody writes in it
    await visibleLink(anna, "Einträge").click();
    await expect(anna.getByRole("option", { name: /Sparkasse/ })).toBeVisible();
    await expect(anna.getByText(/hat jemand neue Schlüssel/).first()).toBeVisible();

    // Jonas compares the code with Anna's and confirms; his client rekeys and rotates Büro
    await openSettings(page);
    await openTeam(page, "Mitglieder");
    const row = page
      .getByRole("list", { name: "Mitglieder" })
      .getByRole("listitem")
      .filter({ hasText: "Anna" });
    await expect(row).toContainText("Neue Schlüssel prüfen", { timeout: 20_000 });
    await row.getByRole("button", { name: "Neue Schlüssel prüfen" }).click();
    const check = page.getByRole("dialog", { name: "Neue Schlüssel von Anna" });
    await expect(check.getByTestId("renewed-code")).toHaveText(code);
    await axe(page);
    const rotation = page.waitForRequest(
      (r) =>
        r.method() === "POST" &&
        r.url().endsWith("/log") &&
        "wrappedKeys" in (r.postDataJSON() ?? {}),
      { timeout: 60_000 },
    );
    await check.getByRole("button", { name: "Code stimmt" }).click();
    await expect(row).toContainText("Bestätigt");
    expect((await rotation).postDataJSON()).toMatchObject({
      entry: { action: "rotate", epoch: 1 },
    });
    await loginInBuero(page, "Neuer Zugang");

    // Anna opens with her passphrase and the new Secret Key this device keeps: she reads both,
    // her own vault gets its new key from her client, and she writes again
    await anna.reload();
    await unlock(anna, ANNA);
    await visibleLink(anna, "Einträge").click();
    await expect(anna.getByRole("option", { name: /Neuer Zugang/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(anna.getByRole("option", { name: /Sparkasse/ })).toBeVisible();
    await expect(anna.getByText(/Schlüsselwechsel aus|neue Schlüssel, weil/)).toHaveCount(0, {
      timeout: 30_000,
    });
    await loginInBuero(anna, "Annas Zugang");

    // The old Recovery Key opens nothing any more
    const thief = await newDevice(browser);
    await thief.goto("/recover");
    await thief.getByLabel("Konto-ID").fill(accountId);
    await thief.getByLabel("Recovery Key").fill(oldRecoveryKey);
    await thief.getByLabel("Passphrase", { exact: true }).fill("Dieb Passphrase lang genug");
    await thief.getByLabel("Passphrase wiederholen").fill("Dieb Passphrase lang genug");
    await thief.getByRole("button", { name: "Neue Passphrase festlegen" }).click();
    await expect(thief.getByRole("alert")).toHaveText("Konto-ID oder Recovery Key stimmt nicht.", {
      timeout: 20_000,
    });
  });
});
