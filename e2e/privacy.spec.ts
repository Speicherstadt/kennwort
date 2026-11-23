import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { PASSPHRASE, setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openVaults } from "./company.ts";

// K-607: Anna of Weber Haustechnik downloads what the server keeps about her and deletes her
// account; Jonas, the last owner, may not leave his company without one, and Jonas's client takes
// Anna out of Büro and changes its key. Alone in his company, Jonas deletes it with his account.
test.use({ locale: "de-DE" });

const ANNA = "Anna Heizung Bad Fliese";

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const openPrivacy = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Datenschutz" }).click();
  await expect(heading(page, "Datenschutz")).toBeVisible();
};

/** The download of what the server keeps, read back as JSON */
const downloadData = async (page: Page) => {
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name: "Daten herunterladen" }).click();
  const file = await started;
  expect(file.suggestedFilename()).toMatch(/^kennwort-daten-\d{4}-\d{2}-\d{2}\.json$/);
  return JSON.parse(await readFile((await file.path()) ?? "", "utf8")) as {
    format: string;
    account: { id: string; role: string };
  };
};

/** Opens the dialog and confirms with this passphrase */
const deleteWith = async (page: Page, passphrase: string) => {
  await page.getByRole("button", { name: "Konto löschen …" }).click();
  const dialog = page.getByRole("dialog", { name: "Konto löschen" });
  await dialog.getByLabel("Passphrase").fill(passphrase);
  await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
  return dialog;
};

/** Jonas creates Büro and takes Anna in to edit */
const annaInBuero = async (page: Page) => {
  await openVaults(page);
  await page.getByLabel("Name").fill("Büro");
  await page.getByRole("button", { name: "Tresor anlegen" }).click();
  await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
  const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
  await dialog.getByLabel("Person").selectOption({ label: "Anna" });
  await dialog.getByLabel("Rolle", { exact: true }).selectOption("edit");
  await dialog.getByRole("button", { name: "Aufnehmen" }).click();
  await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("edit");
  await dialog.getByRole("button", { name: "Schließen" }).click();
};

test.describe("privacy", { tag: "@phone" }, () => {
  test("Anna downloads her data and deletes her account; Jonas's client takes her out of Büro", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await annaInBuero(page);

    // Jonas is the last owner: he may not leave Anna in a company without one
    await openPrivacy(page);
    const refused = await deleteWith(page, PASSPHRASE);
    await expect(refused.getByRole("alert")).toHaveText(
      "Du bist der letzte Inhaber. Mach zuerst jemand anderen zum Inhaber.",
    );
    await refused.getByRole("button", { name: "Schließen" }).click();

    await openPrivacy(anna);
    await expect(anna.getByRole("list", { name: "Was der Server nie sieht" })).toContainText(
      "Deine Passphrase",
    );
    await expect(anna.getByText("exportieren Inhaber und Admins")).toBeVisible();
    await axe(anna);
    const data = await downloadData(anna);
    expect(data).toMatchObject({ format: "kennwort-privacy-export", account: { role: "member" } });

    // A typo deletes nothing
    const dialog = await deleteWith(anna, "Anna Heizung Bad Fliesen");
    await expect(dialog.getByRole("alert")).toHaveText("Die Passphrase stimmt nicht.");
    await dialog.getByLabel("Passphrase").fill(ANNA);
    const deleted = anna.waitForResponse(
      (r) => r.request().method() === "DELETE" && r.url().endsWith("/api/account"),
    );
    await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
    expect((await deleted).status()).toBe(200);
    await expect(heading(anna, "Willkommen bei Kennwort")).toBeVisible();
    expect(await anna.evaluate(() => localStorage.getItem("kennwort-device"))).toBeNull();

    // Jonas's client removes her from Büro and rotates its key, signed by him (P-11)
    const rotation = page.waitForRequest(
      (r) =>
        r.method() === "POST" &&
        r.url().endsWith("/log") &&
        (r.postDataJSON() as { entry?: { action?: string } } | null)?.entry?.action === "rotate",
    );
    // Not on /privacy: its closed dialog keeps a password field the unlock helper would count
    await page.goto("/entries");
    await unlock(page);
    expect((await rotation).postDataJSON()).toMatchObject({
      entry: { action: "rotate", epoch: 1 },
    });
    await openVaults(page);
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const members = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await expect(
      members.getByRole("list", { name: "Mitglieder des Tresors" }).getByRole("listitem"),
    ).toHaveCount(1);
  });

  test("Jonas, alone in his company, deletes it with his account", async ({ page }) => {
    const owner = await setUpCompany(page);
    await openPrivacy(page);
    await expect(page.getByRole("button", { name: "Exportieren" })).toBeVisible();
    const data = await downloadData(page);
    expect(data.account.role).toBe("owner");
    const dialog = await deleteWith(page, PASSPHRASE);
    await expect(dialog).toBeHidden();
    await expect(heading(page, "Willkommen bei Kennwort")).toBeVisible();
    // The old session opens nothing any more
    const answer = await page.request.get("/api/company", {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(answer.status()).toBe(401);
  });
});
