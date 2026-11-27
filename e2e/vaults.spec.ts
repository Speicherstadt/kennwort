import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";
import {
  addVaultMembers,
  annaJoins,
  changeVaultMemberRole,
  createVault,
  heading,
  openVaults,
  personJoins,
  removeVaultMember,
  selectVault,
} from "./company.ts";

// K-305 & K-608: Team → Vaults without groups, Master-Detail with role sections and verified log
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const roleSection = (page: Page, role: "Verwalten" | "Bearbeiten" | "Lesen") =>
  page.getByRole("region", { name: role, exact: true });

test.describe("vaults", { tag: "@phone" }, () => {
  test("Team has two tabs, /groups redirects to /vaults, and Büro persists after unlock", async ({
    page,
  }) => {
    await setUpCompany(page);
    await page.goto("/groups");
    await unlock(page);
    await expect(page).toHaveURL(/\/vaults$/);
    const tabs = page.getByRole("navigation", { name: "Team" }).getByRole("link");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText("Mitglieder");
    await expect(tabs.nth(1)).toHaveText("Tresore");

    const list = page.getByRole("navigation", { name: "Tresore" });
    await expect(list).toContainText("Persönlich");
    await createVault(page, "Büro");
    await selectVault(page, "Büro");
    await expect(page.getByText("Protokoll geprüft")).toBeVisible();
    await axe(page);

    await page.reload();
    await unlock(page);
    await openVaults(page);
    await expect(list).toContainText("Büro");
  });
});

test.describe("vault access flows (K-608)", { tag: "@phone" }, () => {
  test("1 & 2: Jonas adds Tim and Sandra as Bearbeiten; unconfirmed Lea is disabled", async ({
    page,
    browser,
  }) => {
    test.slow();
    await setUpCompany(page);
    await personJoins(page, browser, "Tim Kaya", "Tim Sonne Mond Stern");
    await personJoins(page, browser, "Sandra Yılmaz", "Sandra Berg Tal Wald");
    await personJoins(page, browser, "Lea Hoffmann", "Lea Fluss See Meer", { confirm: false });
    await openVaults(page);
    await createVault(page, "Büro");
    await selectVault(page, "Büro");

    // 2: Lea is visible as disabled in the suggestions (desktop combobox or phone sheet)
    const mobileBtn = page.getByRole("button", { name: "Personen hinzufügen" });
    if (await mobileBtn.isVisible()) {
      await mobileBtn.click();
      const sheet = page.getByRole("dialog", { name: "Personen hinzufügen" });
      await expect(sheet.getByRole("checkbox", { name: /Lea Hoffmann/ })).toBeDisabled();
      await sheet.getByRole("button", { name: "Abbrechen" }).click();
    } else {
      const combo = page.getByRole("combobox", { name: "Person hinzufügen" });
      await combo.click();
      await expect(page.getByRole("option", { name: /Lea Hoffmann/ })).toBeDisabled();
      await combo.press("Escape");
    }

    // 1: Add Tim and Sandra with Bearbeiten
    await addVaultMembers(page, ["Tim Kaya", "Sandra Yılmaz"], "Bearbeiten");
    const edit = roleSection(page, "Bearbeiten");
    await expect(edit).toContainText("Tim Kaya");
    await expect(edit).toContainText("Sandra Yılmaz");
    await axe(page);
  });

  test("3, 4 & 5: role change with Undo, time limit, and removal with rotation dialog and history", async ({
    page,
    browser,
  }) => {
    test.slow();
    await setUpCompany(page);
    await annaJoins(page, browser);
    await personJoins(page, browser, "Max Brandt", "Max Haus Dach Wand");
    await openVaults(page);
    await createVault(page, "Büro");
    await selectVault(page, "Büro");
    await addVaultMembers(page, ["Anna", "Max Brandt"], "Lesen");
    await expect(roleSection(page, "Lesen")).toContainText("Max Brandt");

    // 3: Change Max to Bearbeiten, then Undo back to Lesen
    await changeVaultMemberRole(page, "Max Brandt", "Bearbeiten");
    await expect(roleSection(page, "Bearbeiten")).toContainText("Max Brandt");
    await page.getByRole("button", { name: "Rückgängig" }).click();
    await expect(roleSection(page, "Lesen")).toContainText("Max Brandt");

    // 4: Limit Anna's access via menu -> "bis …"
    await page.getByRole("button", { name: /^Anna.*: Rolle ändern oder entfernen/ }).click();
    await page.getByRole("menuitem", { name: /Zugriff befristen/ }).click();
    const untilDlg = page.getByRole("dialog", { name: /Zugriff für Anna befristen/ });
    await untilDlg.getByLabel("Zugriff bis").fill("2099-12-31");
    await untilDlg.getByRole("button", { name: "Speichern" }).click();
    await expect(roleSection(page, "Lesen")).toContainText("bis");
    await expect(roleSection(page, "Lesen")).toContainText("2099");

    // 5: Remove Max -> alertdialog names Schlüsselwechsel and Zum Ändern -> history shows both
    await page.getByRole("button", { name: /^Max Brandt.*: Rolle ändern oder entfernen/ }).click();
    await page.getByRole("menuitem", { name: /Aus Büro entfernen/ }).click();
    const rmDlg = page.getByRole("alertdialog");
    await expect(rmDlg).toContainText("Neuer Schlüssel");
    await expect(rmDlg).toContainText("Zum Ändern");
    await rmDlg.getByRole("button", { name: "Entfernen", exact: true }).click();
    await expect(rmDlg).toBeHidden();
    await expect(roleSection(page, "Lesen")).not.toContainText("Max Brandt");
    const history = page.getByRole("complementary", { name: "Verlauf" });
    await expect(history).toContainText("entfernt");
    await expect(history).toContainText("Schlüssel gewechselt");
  });

  test("6: Tim requests access via link; Jonas sees the blue notice and grants it", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const tim = await personJoins(page, browser, "Tim Kaya", "Tim Sonne Mond Stern");
    await openVaults(page);
    const link = await createVault(page, "Baustellen-Tablets");

    await tim.goto(link);
    await unlock(tim, "Tim Sonne Mond Stern");
    await expect(heading(tim, "Kein Zugriff")).toBeVisible();
    await tim.getByRole("button", { name: "Zugriff anfragen" }).click();
    await expect(tim.getByRole("main").getByRole("status")).toContainText("bei den Verwaltern");

    await openVaults(page);
    await selectVault(page, "Baustellen-Tablets");
    const requests = page.getByRole("region", { name: "Anfragen" });
    await expect(requests).toContainText("Tim Kaya möchte Zugriff");
    await axe(page);
    await requests.getByRole("button", { name: "Freigeben" }).click();
    await expect(roleSection(page, "Lesen")).toContainText("Tim Kaya");

    await openVaults(tim);
    await expect(tim.getByRole("navigation", { name: "Tresore" })).toContainText(
      "Baustellen-Tablets",
    );
  });

  test("7: In Lohn (managed by Sandra), Jonas sees no add field and no member menu", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const sandra = await personJoins(page, browser, "Sandra Yılmaz", "Sandra Berg Tal Wald");
    await openVaults(sandra);
    await createVault(sandra, "Lohn");
    await selectVault(sandra, "Lohn");
    await addVaultMembers(sandra, ["Konto ohne Namen"], "Lesen").catch(async () => {
      // Fallback if Jonas has a label
      await addVaultMembers(sandra, ["Jonas"], "Lesen");
    });

    await openVaults(page);
    await selectVault(page, "Lohn");
    await expect(page.getByText("verwaltet von Sandra")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Person hinzufügen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Personen hinzufügen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Rolle ändern oder entfernen/ })).toHaveCount(0);
    await axe(page);
  });

  test("a member whose vault did not load is not told she has no access", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await openVaults(page);
    const link = await createVault(page, "Büro");
    await selectVault(page, "Büro");
    await addVaultMembers(page, ["Anna"], "Lesen");
    await expect(roleSection(page, "Lesen")).toContainText("Anna");
    const vaultId = new URL(link).pathname.split("/").pop();

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

// Keep removeVaultMember referenced if needed by other specs
void removeVaultMember;
