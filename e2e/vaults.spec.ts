import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";

// K-305 part 2 (P-05, P-06): Jonas gets his personal vault and creates a shared one for the office
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const openVaults = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Tresore" }).click();
  await expect(heading(page, "Tresore")).toBeVisible();
};

test.describe("vaults", { tag: "@phone" }, () => {
  test("Jonas finds his personal vault and creates the vault Büro, which stays after unlocking", async ({
    page,
  }) => {
    await setUpCompany(page);
    await openVaults(page);
    const list = page.getByRole("main").getByRole("list");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("listitem").first()).toContainText("Persönlich");
    await expect(list.getByRole("listitem").first()).toContainText("Verwalten");

    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText("Büro");
    await axe(page);

    // The names come from the server sealed: after reloading they open again
    await page.reload();
    await unlock(page);
    await openVaults(page);
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await list.getByRole("link", { name: /Büro/ }).click();
    await expect(heading(page, "Büro")).toBeVisible();
  });
});

/** Jonas invites Anna, she accepts on her own device, Jonas confirms her keys */
const annaJoins = async (page: Page, browser: Browser) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Mitglieder" }).click();
  await page.getByLabel("Name").fill("Anna");
  await page.getByRole("button", { name: "Einladen" }).click();
  const link = await page.getByLabel("Einladungslink").inputValue();
  const anna = await newDevice(browser);
  await anna.goto(link);
  await anna.getByLabel("Passphrase", { exact: true }).fill("Anna Heizung Bad Fliese");
  await anna.getByLabel("Passphrase wiederholen").fill("Anna Heizung Bad Fliese");
  await anna.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(heading(anna, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
  await anna.getByRole("checkbox").check();
  await anna.getByRole("button", { name: "Weiter" }).click();
  await expect(heading(anna, "Alle Einträge")).toBeVisible();
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Mitglieder" }).click();
  const row = page
    .getByRole("list", { name: "Mitglieder" })
    .getByRole("listitem")
    .filter({ hasText: "Anna" });
  await row.getByRole("button", { name: "Bestätigen" }).click();
  await expect(row).toContainText("Bestätigt");
  return anna;
};

test.describe("members of a vault", { tag: "@phone" }, () => {
  test("Jonas adds Anna to Büro to read, lets her edit, then removes her", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await dialog.getByLabel("Person").selectOption({ label: "Anna" });
    await dialog.getByLabel("Rolle", { exact: true }).selectOption("read");
    await dialog.getByRole("button", { name: "Aufnehmen" }).click();
    const members = dialog.getByRole("list", { name: "Mitglieder des Tresors" });
    await expect(members.getByRole("listitem")).toHaveCount(2);
    await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("read");
    await axe(page);

    // Anna's device checks the log itself and opens Büro to read
    await openVaults(anna);
    const annaList = anna.getByRole("main").getByRole("list");
    await expect(annaList.getByRole("listitem").filter({ hasText: "Büro" })).toContainText("Lesen");

    await dialog.getByLabel("Rolle von Anna").selectOption("edit");
    await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("edit");
    await openVaults(anna);
    await expect(annaList.getByRole("listitem").filter({ hasText: "Büro" })).toContainText(
      "Bearbeiten",
    );

    await dialog
      .getByRole("listitem")
      .filter({ hasText: "Anna" })
      .getByRole("button", { name: "Entfernen" })
      .click();
    await expect(members.getByRole("listitem")).toHaveCount(1);
    await openVaults(anna);
    await expect(annaList.getByRole("listitem").filter({ hasText: "Büro" })).toHaveCount(0);
  });
});

test.describe("access requests", { tag: "@phone" }, () => {
  test("Anna opens a link to Büro, asks for access, and Jonas grants it", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("main").getByRole("link", { name: /Büro/ }).click();
    const link = page.url();

    await anna.goto(link);
    await unlock(anna, "Anna Heizung Bad Fliese");
    await expect(heading(anna, "Kein Zugriff")).toBeVisible();
    await axe(anna);
    await anna.getByRole("button", { name: "Zugriff anfragen" }).click();
    await expect(anna.getByRole("main").getByRole("status")).toContainText("bei den Verwaltern");

    await openVaults(page);
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    const requests = dialog.getByRole("list", { name: "Anfragen" });
    await expect(requests.getByRole("listitem")).toHaveCount(1);
    await expect(requests).toContainText("Anna");
    await axe(page);
    await requests.getByRole("button", { name: "Freigeben" }).click();
    await expect(dialog.getByRole("list", { name: "Anfragen" })).toHaveCount(0);
    await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("read");

    await openVaults(anna);
    await expect(
      anna.getByRole("main").getByRole("list").getByRole("listitem").filter({ hasText: "Büro" }),
    ).toContainText("Lesen");
  });

  test("Jonas adds Anna until a day; the dialog shows how long", async ({ page, browser }) => {
    await setUpCompany(page);
    await annaJoins(page, browser);
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await dialog.getByLabel("Person").selectOption({ label: "Anna" });
    await dialog.getByLabel("Zugriff bis (optional)").fill("2099-12-31");
    await dialog.getByRole("button", { name: "Aufnehmen" }).click();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Anna" })).toContainText("bis");
    await expect(dialog.getByRole("listitem").filter({ hasText: "Anna" })).toContainText("2099");
  });
  test("a member whose vault did not load is not told she has no access", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await dialog.getByLabel("Person").selectOption({ label: "Anna" });
    await dialog.getByRole("button", { name: "Aufnehmen" }).click();
    await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("read");
    await page.keyboard.press("Escape");
    await page.getByRole("main").getByRole("link", { name: /Büro/ }).click();
    const link = page.url();
    const vaultId = new URL(link).pathname.split("/").pop();

    // Anna is a member, but the log of Büro does not come through this time
    let failed = 0;
    await anna.route(`**/api/vaults/${vaultId}/log`, (route) => {
      failed++;
      return route.fulfill({ status: 503, body: "" });
    });
    await anna.goto(link);
    await unlock(anna, "Anna Heizung Bad Fliese");
    await expect.poll(() => failed).toBeGreaterThan(0);
    await anna.waitForTimeout(1500);
    await expect(heading(anna, "Kein Zugriff")).toHaveCount(0);
  });
});

test("the desktop sidebar lists the vaults and leads to all of them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setUpCompany(page);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "Persönlich" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Alle Tresore" }).click();
  await expect(heading(page, "Tresore")).toBeVisible();
});
