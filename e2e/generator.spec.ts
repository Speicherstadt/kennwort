import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { readClipboard } from "./clipboard.ts";
import { goInApp } from "./entries.ts";

// K-306 part 3: the generator makes passwords and passphrases on the device; the entry editor fills
// a password with the options last chosen there
test.use({ locale: "de-DE" });

const result = (page: Page) => page.getByRole("status", { name: "Ergebnis" });

test.describe("generator", { tag: "@phone" }, () => {
  test("Jonas makes a password and a passphrase to his liking and copies one", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setUpCompany(page);
    await page.getByRole("link", { name: "Generator" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Generator" })).toBeVisible();
    await expect(result(page)).toHaveText(/^.{20}$/);
    await expect(page.getByText("Stark · 124 Bit")).toBeVisible();

    await page.getByLabel("Länge: 20 Zeichen").fill("32");
    await page.getByLabel("Sonderzeichen").uncheck();
    await expect(result(page)).toHaveText(/^[a-zA-Z0-9]{32}$/);
    await expect(page.getByText("Länge: 32 Zeichen")).toBeVisible();

    await page.getByRole("tab", { name: "Passphrase" }).click();
    await page.getByLabel("Trennzeichen").selectOption({ label: "Leerzeichen" });
    await page.getByLabel("Wörter groß beginnen").check();
    await expect(result(page)).toHaveText(/^[A-Z][a-z-]+( [A-Z][a-z-]+){4}$/);
    await expect(page.getByText("Gut · 64 Bit")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);

    await page.getByRole("button", { name: "Passphrase kopieren" }).click();
    await expect(page.getByText("Passphrase kopiert")).toBeVisible();
    const copied = await readClipboard(context, page.url());
    await expect(result(page)).toHaveText(copied);

    // Remembered on this device: the page opens with the passphrase again
    await goInApp(page, "/");
    await goInApp(page, "/generator");
    await expect(page.getByRole("tab", { name: "Passphrase" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("the entry editor fills a password with the generator's options", async ({ page }) => {
    await setUpCompany(page);
    await page.getByRole("link", { name: "Generator" }).filter({ visible: true }).first().click();
    await page.getByLabel("Länge: 20 Zeichen").fill("40");
    await expect(page.getByText("Länge: 40 Zeichen")).toBeVisible();
    await page.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
    await page
      .getByRole("button", { name: "Neu", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const dialog = page.getByRole("form", { name: "Neuer Eintrag" });
    const field = dialog.getByLabel("Passwort", { exact: true });
    await expect(field).toHaveValue("");
    await dialog.getByRole("button", { name: "Passwort erzeugen" }).click();
    await expect(field).toHaveValue(/^.{40}$/);
    const first = await field.inputValue();
    await dialog.getByRole("button", { name: "Passwort erzeugen" }).click();
    await expect(field).not.toHaveValue(first);
  });
});
