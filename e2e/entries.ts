// Entries for the e2e tests (K-306): written through the app's own dialog, like a person does
import { expect, type Page } from "@playwright/test";

export type Login = { title: string; username?: string; password?: string; website?: string };

let counter = 0;
/** A title no other test of the worker uses: the worker's account keeps its entries */
export const unique = (title: string) => `${title} ${Date.now().toString(36)}${counter++}`;

/** Creates a login in the first vault offered and returns its ID; the app then shows it */
export const addEntry = async (page: Page, login: Login) => {
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Neuer Eintrag" });
  await dialog.getByLabel("Titel").fill(login.title);
  await dialog.getByLabel("Benutzername").fill(login.username ?? "");
  await dialog.getByLabel("Passwort", { exact: true }).fill(login.password ?? "");
  await dialog.getByLabel("Website").fill(login.website ?? "");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: login.title })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop() ?? "";
};

/** Goes to a path inside the app without loading the page anew, which would lock it */
export const goInApp = async (page: Page, path: string) => {
  await page.evaluate((to) => {
    history.pushState(null, "", to);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
};
