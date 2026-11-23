import { type Browser, expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test, unlock } from "./account.ts";
import { heading, openVaults } from "./company.ts";
import { unique } from "./entries.ts";
import { OIDC_NAME } from "./oidc.ts";

// K-604 (P-25): Sandra signs in through the company's identity provider. She gets an account
// without any vault, which Jonas confirms only after comparing codes with her; a group the
// provider names later becomes an access request, never access.
test.use({ locale: "de-DE" });

const openSettings = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await expect(heading(page, "Einstellungen")).toBeVisible();
};

/** Jonas lets people of the provider join and reads the link to join */
const openEnrolment = async (page: Page) => {
  await openSettings(page);
  await page.getByLabel(`Neue Personen über ${OIDC_NAME} aufnehmen`).click();
  const link = page.getByTestId("oidc-enrolment-url");
  await expect(link).toBeVisible();
  return (await link.textContent()) ?? "";
};

/** The provider's login form, as a person fills it in */
const signInAtProvider = async (person: Page, sub: string, groups = "") => {
  await person.getByLabel("User").fill(sub);
  await person.getByLabel("Name").fill("Sandra Weber");
  await person.getByLabel("Groups").fill(groups);
  await person.getByRole("button", { name: "Sign in" }).click();
};

/** Sandra follows the link, signs in at the provider, makes her account and reads her codes */
const sandraEnrols = async (browser: Browser, link: string, sub: string, groups = "") => {
  const sandra = await newDevice(browser);
  await sandra.goto(link);
  await signInAtProvider(sandra, sub, groups);
  await expect(sandra.getByText("Angemeldet als Sandra Weber.")).toBeVisible();
  // The ticket never stays in the address
  expect(new URL(sandra.url()).hash).toBe("");
  await sandra.getByLabel("Passphrase", { exact: true }).fill("Sandra Lager Regal Palette");
  await sandra.getByLabel("Passphrase wiederholen").fill("Sandra Lager Regal Palette");
  await sandra.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(heading(sandra, "Dein Recovery-Kit")).toBeVisible({ timeout: 20_000 });
  await sandra.getByRole("checkbox").check();
  await sandra.getByRole("button", { name: "Weiter" }).click();
  await expect(heading(sandra, "Warten auf Bestätigung")).toBeVisible();
  const own = (await sandra.getByTestId("own-code").textContent()) ?? "";
  const company = (await sandra.getByTestId("company-code").textContent()) ?? "";
  await sandra.getByRole("button", { name: "Weiter" }).click();
  await expect(heading(sandra, "Alle Einträge")).toBeVisible();
  return { sandra, own, company };
};

const sandraRow = (page: Page) =>
  page
    .getByRole("list", { name: "Mitglieder" })
    .getByRole("listitem")
    .filter({ hasText: "Sandra Weber" });

/** Jonas compares both codes with Sandra and confirms her */
const jonasConfirms = async (page: Page, codes: { own: string; company: string }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Mitglieder" }).click();
  await expect(sandraRow(page)).toContainText("Code vergleichen");
  await sandraRow(page).getByRole("button", { name: "Code vergleichen" }).click();
  const dialog = page.getByRole("dialog", { name: "Sandra Weber bestätigen" });
  await expect(dialog.getByTestId("enrolled-code")).toHaveText(codes.own);
  await expect(dialog.getByTestId("company-code")).toHaveText(codes.company);
  await dialog.getByRole("button", { name: "Code stimmt" }).click();
  await expect(sandraRow(page)).toContainText("Bestätigt");
};

test.describe("OpenID Connect", { tag: "@phone" }, () => {
  test("Sandra enrols through the provider and gets in only after Jonas compared codes", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const link = await openEnrolment(page);
    const codes = await sandraEnrols(browser, link, unique("sandra"));
    await jonasConfirms(page, codes);
  });

  test("a group the provider names later shows as an access request for the manager", async ({
    page,
    browser,
  }) => {
    // Two people, a group, a vault and two sign-ins through the provider
    test.slow();
    await setUpCompany(page);
    await page.goto("/groups");
    await unlock(page);
    await page.getByLabel("Name der Gruppe").fill("Technik");
    await page.getByRole("button", { name: "Gruppe anlegen" }).click();
    await openVaults(page);
    await page.getByLabel("Name").fill("Büro");
    await page.getByRole("button", { name: "Tresor anlegen" }).click();
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const members = page.getByRole("dialog", { name: "Mitglieder von Büro" });
    await members.getByLabel("Gruppe", { exact: true }).selectOption({ label: "Technik" });
    await members.getByRole("button", { name: "Verknüpfen" }).click();
    await expect(members.getByRole("list", { name: "Gruppen" })).toContainText("Technik");
    await members.press("Escape");

    const link = await openEnrolment(page);
    const sub = unique("sandra");
    const codes = await sandraEnrols(browser, link, sub);
    await jonasConfirms(page, codes);

    // Later the provider puts Sandra into Technik; her next sign-in through it files the request
    const { sandra } = codes;
    await sandra.goto("/");
    await sandra.getByRole("link", { name: `Mit ${OIDC_NAME} anmelden` }).click();
    await signInAtProvider(sandra, sub, "Technik");
    // No session from the provider's word: she unlocks with her passphrase as always
    await expect(heading(sandra, "Kennwort ist gesperrt")).toBeVisible();

    await openVaults(page);
    await page.getByRole("button", { name: "Mitglieder von Büro" }).click();
    const requests = members.getByRole("list", { name: "Anfragen" });
    await expect(requests).toContainText("Sandra Weber");
    await members.press("Escape");
    await openSettings(page);
    await expect(page.getByTestId("oidc-groups")).toContainText("Technik1 über den Anmeldedienst");
  });
});
