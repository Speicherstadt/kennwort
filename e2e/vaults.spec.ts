import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";
import { annaJoins, heading, openVaults } from "./company.ts";

// K-305 part 2 (P-05, P-06): Jonas gets his personal vault and creates a shared one for the office
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
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

    await dialog.getByRole("button", { name: "Anna aus dem Tresor entfernen" }).click();
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

test.describe("groups", { tag: "@phone" }, () => {
  test("Jonas links the group Büro-Team to Büro; Anna's joining asks, his grant lets her in", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await page.goto("/groups");
    await unlock(page);
    await expect(heading(page, "Gruppen")).toBeVisible();
    await page.getByLabel("Name der Gruppe").fill("Büro-Team");
    await page.getByRole("button", { name: "Gruppe anlegen" }).click();
    await page.getByLabel("Person für Büro-Team").selectOption({ label: "Anna" });
    await page.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(page.getByRole("list", { name: "Büro-Team" })).toContainText("Anna");
    await axe(page);

    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await dialog.getByLabel("Gruppe", { exact: true }).selectOption({ label: "Büro-Team" });
    await dialog.getByRole("button", { name: "Verknüpfen" }).click();
    await expect(dialog.getByRole("list", { name: "Gruppen" })).toContainText("Büro-Team");
    const requests = dialog.getByRole("list", { name: "Anfragen" });
    await expect(requests).toContainText("Anna");
    await axe(page);
    await requests.getByRole("button", { name: "Freigeben" }).click();
    await expect(dialog.getByLabel("Rolle von Anna")).toHaveValue("read");

    await openVaults(anna);
    await expect(
      anna.getByRole("main").getByRole("list").getByRole("listitem").filter({ hasText: "Büro" }),
    ).toContainText("Lesen");
  });
  test("a request filed by a group linked as Bearbeiten offers Bearbeiten when granting", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    await annaJoins(page, browser);
    await page.goto("/groups");
    await unlock(page);
    await page.getByLabel("Name der Gruppe").fill("Büro-Team");
    await page.getByRole("button", { name: "Gruppe anlegen" }).click();
    await page.getByLabel("Person für Büro-Team").selectOption({ label: "Anna" });
    await page.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(page.getByRole("list", { name: "Büro-Team" })).toContainText("Anna");
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await dialog.getByLabel("Gruppe", { exact: true }).selectOption({ label: "Büro-Team" });
    await dialog.getByLabel("Rolle für die Gruppe").selectOption({ label: "Bearbeiten" });
    await dialog.getByRole("button", { name: "Verknüpfen" }).click();
    await expect(dialog.getByRole("list", { name: "Gruppen" })).toContainText("Bearbeiten");
    const requests = dialog.getByRole("list", { name: "Anfragen" });
    await expect(requests).toContainText("Anna");
    // the link says Büro-Team is asked in with Bearbeiten; the grant should offer that role
    await expect(requests.getByLabel("Rolle für Anna")).toHaveValue("edit");
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
