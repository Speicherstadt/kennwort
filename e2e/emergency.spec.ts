import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { annaJoins, createVault, heading, openVaults } from "./company.ts";

// K-307 part d (P-14): Jonas names Anna for emergency access to Büro with a week's wait; Anna asks,
// Jonas objects, which blocks it; Anna asks again, Jonas lets it out early, and Anna reads Büro's
// login, read-only, as her client checked it against what Jonas signed and Büro's log binds
test.use({ locale: "de-DE" });

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

const visibleLink = (page: Page, name: string) =>
  page.getByRole("link", { name }).filter({ visible: true }).first();

/** Einstellungen → Notfallzugriff, anew each time: the page loads the lists when it opens */
const openEmergency = async (page: Page) => {
  await visibleLink(page, "Einstellungen").click();
  await page.getByRole("tab", { name: "Konto" }).click();
  await page.getByRole("button", { name: "Notfallzugriff" }).click();
  await expect(heading(page, "Notfallzugriff")).toBeVisible();
};
const given = (page: Page) => page.getByRole("list", { name: "Von dir gegeben" });
const received = (page: Page) => page.getByRole("list", { name: "Für dich" });

/** Jonas creates Büro and writes the Sparkasse login into it */
const sparkasseInBuero = async (page: Page) => {
  await openVaults(page);
  await createVault(page, "Büro");
  await visibleLink(page, "Einträge").click();
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const editor = page.getByRole("form", { name: "Neuer Eintrag" });
  await editor.getByLabel("Tresor").selectOption({ label: "Büro" });
  await editor.getByLabel("Titel").fill("Sparkasse");
  await editor.getByLabel("Benutzername").fill("jonas@weber-haustechnik.de");
  await editor.getByLabel("Passwort", { exact: true }).fill("Rohr-Ventil-2026!");
  await editor.getByRole("button", { name: "Speichern" }).click();
  await expect(heading(page, "Sparkasse")).toBeVisible();
};

test.describe("emergency access", { tag: "@phone" }, () => {
  test("Jonas names Anna, objects to her request, then lets it out early; Anna reads Büro", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await sparkasseInBuero(page);

    // Jonas gives Anna view access to Büro with a week's wait
    await openEmergency(page);
    await expect(page.getByText("Du hast noch niemandem Notfallzugriff gegeben.")).toBeVisible();
    await page.getByLabel("Person").selectOption({ label: "Anna" });
    await page.getByRole("checkbox", { name: "Büro" }).check();
    await page.getByLabel("Wartezeit").selectOption({ label: "7 Tage" });
    await axe(page);
    await page.getByRole("button", { name: "Notfallzugriff geben" }).click();
    await expect(given(page)).toContainText("Anna");
    await expect(given(page)).toContainText("Keine Anfrage");

    // Anna sees the grant and asks for access
    await openEmergency(anna);
    // The owner who set the company up has no name in the members list
    await expect(received(anna)).toContainText("Konto ohne Namen");
    await expect(received(anna)).toContainText("Ansehen · 7 Tage");
    await received(anna).getByRole("button", { name: "Zugriff anfragen" }).click();
    await expect(received(anna)).toContainText("Angefragt – frei ab");

    // Jonas sees the request, is told on the other pages too, and objects
    await openEmergency(page);
    await expect(given(page)).toContainText("Angefragt – frei ab");
    await visibleLink(page, "Einträge").click();
    await expect(page.getByText("Anna bittet um Notfallzugriff.")).toBeVisible();
    await openEmergency(page);
    await given(page).getByRole("button", { name: "Widersprechen" }).click();
    await expect(given(page)).toContainText("Widersprochen");

    // Anna sees the objection: nothing to open, but she may ask again
    await openEmergency(anna);
    await expect(received(anna)).toContainText("Widersprochen");
    await expect(received(anna).getByRole("button", { name: "Öffnen" })).toHaveCount(0);
    await received(anna).getByRole("button", { name: "Zugriff anfragen" }).click();
    await expect(received(anna)).toContainText("Angefragt – frei ab");

    // This time Jonas lets it out before the week is over
    await openEmergency(page);
    await given(page).getByRole("button", { name: "Jetzt freigeben" }).click();
    await expect(given(page)).toContainText("Freigegeben");

    // Anna opens Büro read-only: the login, its password masked until revealed
    await openEmergency(anna);
    await received(anna).getByRole("button", { name: "Öffnen" }).click();
    const login = received(anna).getByRole("listitem", { name: "Sparkasse" });
    await expect(login).toContainText("jonas@weber-haustechnik.de");
    await expect(login).not.toContainText("Rohr-Ventil-2026!");
    await login.getByRole("button", { name: "Passwort aufdecken" }).click();
    await expect(login).toContainText("Rohr-Ventil-2026!");
    await axe(anna);

    // Jonas revokes: Anna's list is empty again
    await openEmergency(page);
    await given(page).getByRole("button", { name: "Notfallzugriff für Anna zurückziehen" }).click();
    await expect(page.getByText("Du hast noch niemandem Notfallzugriff gegeben.")).toBeVisible();
    await openEmergency(anna);
    await expect(anna.getByText("Niemand hat dir Notfallzugriff gegeben.")).toBeVisible();
  });
});
