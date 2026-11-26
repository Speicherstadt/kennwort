import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openTeam } from "./company.ts";

// K-307 part f (P-07): Max, an admin, leaves Weber Haustechnik with a copy of the company root.
// Jonas's client replaces the root at once; Anna's client shows the change and takes the new root
// only after she compared its code with Jonas's. Later Jonas replaces it once more by hand.
test.use({ locale: "de-DE" });

const ANNA = "Anna Heizung Bad Fliese";
const CODE = /^(\d{5} ){11}\d{5}$/;

/** Axe on the page, or only on a part of it */
const axe = async (page: Page, part?: string) => {
  const builder = new AxeBuilder({ page });
  const { violations } = await (part ? builder.include(part) : builder).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const openMembers = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await openTeam(page, "Mitglieder");
  await expect(heading(page, "Mitglieder")).toBeVisible();
};
const members = (page: Page) => page.getByRole("list", { name: "Mitglieder" });
const rootCode = async (page: Page) => (await page.getByTestId("root-code").textContent()) ?? "";

/** Jonas invites Max, Max accepts on his own device, Jonas confirms him and makes him admin */
const maxBecomesAdmin = async (page: Page, browser: Parameters<typeof newDevice>[0]) => {
  await openMembers(page);
  await page.getByLabel("Name", { exact: true }).fill("Max");
  await page.getByRole("button", { name: "Einladen" }).click();
  const link = await page.getByLabel("Einladungslink").inputValue();
  const max = await newDevice(browser);
  await max.goto(link);
  await max.getByLabel("Passphrase", { exact: true }).fill("Max Werkstatt Lager Rohr");
  await max.getByLabel("Passphrase wiederholen").fill("Max Werkstatt Lager Rohr");
  await max.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(heading(max, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
  await openMembers(page);
  const row = members(page).getByRole("listitem").filter({ hasText: "Max" });
  await row.getByRole("button", { name: "Bestätigen" }).click();
  await expect(row).toContainText("Bestätigt");
  await page.getByLabel("Rolle von Max").selectOption("admin");
  await openMembers(page);
  await expect(page.getByLabel("Rolle von Max")).toHaveValue("admin");
};

/** Anna sees the change waiting, compares the code with Jonas's and takes it */
const annaConfirms = async (anna: Page, jonasCode: string) => {
  await openMembers(anna);
  const notice = anna.getByRole("region", { name: "Neuer Firmenschlüssel" });
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(anna.getByTestId("root-change-code")).toHaveText(jonasCode);
  // Until she confirms, her client trusts nobody under the new root
  await expect(members(anna)).toHaveCount(0);
  await axe(anna);
  const keyBlock = anna.waitForResponse(
    (r) => r.url().endsWith("/api/account/key-block") && r.request().method() === "PUT",
  );
  await notice.getByRole("button", { name: "Code stimmt, übernehmen" }).click();
  expect((await keyBlock).status()).toBe(200);
  await expect(notice).toBeHidden();
  await expect(members(anna).getByRole("listitem").filter({ hasText: "Du" })).toContainText(
    "Bestätigt",
  );
  await expect(anna.getByTestId("root-code")).toHaveText(jonasCode);
};

test.describe("a new company root", { tag: "@phone" }, () => {
  test("an admin leaves, Jonas's client replaces the root, Anna takes it only after comparing the code", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await maxBecomesAdmin(page, browser);
    const before = await rootCode(page);
    expect(before).toMatch(CODE);

    // Jonas removes Max from the company; his client makes a new root at once
    const rotation = page.waitForResponse(
      (r) => r.url().endsWith("/api/company/root") && r.request().method() === "PUT",
    );
    await members(page).getByRole("button", { name: "Max aus der Firma entfernen" }).click();
    await page
      .getByRole("dialog", { name: "Max aus der Firma entfernen" })
      .getByRole("button", { name: "Entfernen" })
      .click();
    expect((await rotation).status()).toBe(200);
    await expect(members(page).getByRole("listitem").filter({ hasText: "Max" })).toContainText(
      "Ausgetreten",
    );
    await expect(page.getByTestId("root-code")).not.toHaveText(before);
    const after = await rootCode(page);
    expect(after).toMatch(CODE);
    await expect(members(page).getByRole("listitem").filter({ hasText: "Anna" })).toContainText(
      "Bestätigt",
    );
    // Only the root section: the row of whoever left is not what this test is about
    await axe(page, 'section[aria-labelledby="root-title"]');

    await annaConfirms(anna, after);

    // On her next unlock the new root holds without asking again
    await anna.reload();
    await unlock(anna, ANNA);
    await openMembers(anna);
    await expect(anna.getByTestId("root-code")).toHaveText(after);
    await expect(anna.getByRole("region", { name: "Neuer Firmenschlüssel" })).toHaveCount(0);

    // Jonas replaces the root once more by hand, after a question
    await page.getByRole("button", { name: "Neuen Firmenschlüssel anlegen" }).click();
    const ask = page.getByRole("dialog", { name: "Neuen Firmenschlüssel anlegen" });
    await expect(ask).toContainText("alten Firmenschlüssel");
    await axe(page);
    await ask.getByRole("button", { name: "Neuen Schlüssel anlegen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "neue Firmenschlüssel" }),
    ).toBeVisible();
    await expect(page.getByTestId("root-code")).not.toHaveText(after);
    const third = await rootCode(page);

    await anna.reload();
    await unlock(anna, ANNA);
    await annaConfirms(anna, third);
  });
});
