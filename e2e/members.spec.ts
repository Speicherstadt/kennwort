import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";

// K-304 part 2 (P-08): Jonas invites Anna from the members page, Anna accepts, Jonas confirms her
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
/** A new device opens the link and makes its account; ends on the entries */
const acceptInvitation = async (device: Page, link: string, passphrase: string) => {
  await device.goto(link);
  await expect(heading(device, "Einladung annehmen")).toBeVisible();
  await device.getByLabel("Passphrase", { exact: true }).fill(passphrase);
  await device.getByLabel("Passphrase wiederholen").fill(passphrase);
  await device.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(heading(device, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
  await device.getByRole("checkbox").check();
  await device.getByRole("button", { name: "Weiter" }).click();
  await expect(heading(device, "Alle Einträge")).toBeVisible();
};
const openMembers = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Mitglieder" }).click();
  await expect(heading(page, "Mitglieder")).toBeVisible();
  return page.getByRole("list", { name: "Mitglieder" });
};

test.describe("members", { tag: "@phone" }, () => {
  test("Jonas invites Anna by link, Anna accepts, Jonas confirms her keys", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    let members = await openMembers(page);
    await expect(members.getByRole("listitem")).toHaveCount(1);
    await expect(members.getByRole("listitem").first()).toContainText("Inhaber");
    await expect(members.getByRole("listitem").first()).toContainText("Bestätigt");

    await page.getByLabel("Name").fill("Anna");
    await page.getByRole("button", { name: "Einladen" }).click();
    const link = await page.getByLabel("Einladungslink").inputValue();
    expect(link).toMatch(/\/invite\/[\w-]{22}#token=.+&s=[\w-]{43}&root=[\w-]{43}$/);
    await axe(page);

    const anna = await newDevice(browser);
    await anna.goto(link);
    await expect(heading(anna, "Einladung annehmen")).toBeVisible();
    await anna.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
    await anna.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
    await anna.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(heading(anna, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
    await anna.getByRole("checkbox").check();
    await anna.getByRole("button", { name: "Weiter" }).click();
    await expect(heading(anna, "Alle Einträge")).toBeVisible();

    // Anna's page shows her waiting, without a form to invite
    const seenByAnna = await openMembers(anna);
    await expect(seenByAnna.getByRole("listitem").filter({ hasText: "Anna" })).toContainText(
      "Wartet auf Bestätigung",
    );
    await expect(anna.getByRole("button", { name: "Einladen" })).toHaveCount(0);

    members = await openMembers(page);
    const annaRow = members.getByRole("listitem").filter({ hasText: "Anna" });
    await expect(annaRow).toContainText("Mitarbeiter");
    await annaRow.getByRole("button", { name: "Bestätigen" }).click();
    await expect(annaRow).toContainText("Bestätigt");
    await axe(page);

    // Anna's devices see her confirmed too, checked against the company key from her link
    await openMembers(anna);
    await expect(
      anna
        .getByRole("list", { name: "Mitglieder" })
        .getByRole("listitem")
        .filter({ hasText: "Anna" }),
    ).toContainText("Bestätigt");
  });

  test("Jonas makes Anna an admin; Anna then invites and confirms Max herself", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    await openMembers(page);
    await page.getByLabel("Name").fill("Anna");
    await page.getByRole("button", { name: "Einladen" }).click();
    const link = await page.getByLabel("Einladungslink").inputValue();
    const anna = await newDevice(browser);
    await acceptInvitation(anna, link, "Anna Heizung Bad Fliese");
    let members = await openMembers(page);
    const annaRow = members.getByRole("listitem").filter({ hasText: "Anna" });
    await annaRow.getByRole("button", { name: "Bestätigen" }).click();
    await expect(annaRow).toContainText("Bestätigt");

    // Jonas cannot change his own role, only Anna's
    await expect(page.getByRole("combobox")).toHaveCount(1);
    await page.getByLabel("Rolle von Anna").selectOption("admin");
    members = await openMembers(page);
    await expect(page.getByLabel("Rolle von Anna")).toHaveValue("admin");
    await expect(members.getByRole("listitem").filter({ hasText: "Anna" })).toContainText(
      "Bestätigt",
    );
    await axe(page);

    // Anna's client takes the root key Jonas wrapped to her, so she can confirm whom she invites
    await openMembers(anna);
    await anna.getByLabel("Name").fill("Max");
    await anna.getByRole("button", { name: "Einladen" }).click();
    const maxLink = await anna.getByLabel("Einladungslink").inputValue();
    const max = await newDevice(browser);
    await acceptInvitation(max, maxLink, "Max Werkstatt Rohr Zange");
    const seenByAnna = await openMembers(anna);
    const maxRow = seenByAnna.getByRole("listitem").filter({ hasText: "Max" });
    await maxRow.getByRole("button", { name: "Bestätigen" }).click();
    await expect(maxRow).toContainText("Bestätigt");
    // An admin gives no roles
    await expect(anna.getByRole("combobox")).toHaveCount(0);
  });

  test("Jonas sets the lock time to one minute; Kennwort then locks after a minute without use", async ({
    page,
    browser,
  }) => {
    await page.clock.install();
    await setUpCompany(page);
    await openMembers(page);
    await expect(page.getByLabel("Sperren nach (Minuten)")).toHaveValue("10");
    await page.getByLabel("Sperren nach (Minuten)").fill("1");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toHaveText(
      "Gespeichert. Die neue Zeit gilt auf allen Geräten.",
    );
    await axe(page);
    await page.clock.fastForward("00:30");
    await expect(heading(page, "Mitglieder")).toBeVisible();
    await page.clock.fastForward("00:31");
    await expect(
      page.getByRole("heading", { level: 1, name: "Kennwort ist gesperrt" }),
    ).toBeVisible();

    // A member sees the time the company set, without a form to change it
    await unlock(page);
    await openMembers(page);
    await page.getByLabel("Name").fill("Anna");
    await page.getByRole("button", { name: "Einladen" }).click();
    const anna = await newDevice(browser);
    await acceptInvitation(
      anna,
      await page.getByLabel("Einladungslink").inputValue(),
      "Anna Heizung Bad Fliese",
    );
    await openMembers(anna);
    await expect(anna.getByText("Kennwort sperrt sich nach 1 Minuten ohne Nutzung.")).toBeVisible();
    await expect(anna.getByLabel("Sperren nach (Minuten)")).toHaveCount(0);
  });
});
