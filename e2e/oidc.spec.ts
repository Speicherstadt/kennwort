import { type Browser, expect, type Page } from "@playwright/test";
import { newDevice, setUpCompany, test } from "./account.ts";
import { heading, openTeam } from "./company.ts";
import { unique } from "./entries.ts";
import { OIDC_NAME } from "./oidc.ts";

// K-604 (P-25): Sandra signs in through the company's identity provider. She gets an account
// without any vault, which Jonas confirms only after comparing codes with her.
test.use({ locale: "de-DE" });

const openSettings = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await expect(heading(page, "Einstellungen")).toBeVisible();
  await page.getByRole("tab", { name: "Geräte und Anmeldung" }).click();
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
const signInAtProvider = async (person: Page, sub: string) => {
  await person.getByLabel("User").fill(sub);
  await person.getByLabel("Name", { exact: true }).fill("Sandra Weber");
  await person.getByRole("button", { name: "Sign in" }).click();
};

/** Sandra follows the link, signs in at the provider, makes her account and reads her codes */
const sandraEnrols = async (browser: Browser, link: string, sub: string) => {
  const sandra = await newDevice(browser);
  await sandra.goto(link);
  await signInAtProvider(sandra, sub);
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
  await openTeam(page, "Mitglieder");
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
});
