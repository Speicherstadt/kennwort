import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { QR, qrPng } from "./qr.ts";

// Review of K-306 part 4b: docs/eintraege.md says a screenshot can be pasted into the scan dialog
test.use({ locale: "de-DE", permissions: ["clipboard-read", "clipboard-write"] });

const openScan = async (page: Page) => {
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("form", { name: "Neuer Eintrag" });
  await dialog.getByRole("button", { name: "QR-Code scannen" }).click();
  return { dialog, scan: page.getByRole("dialog", { name: "QR-Code scannen" }) };
};

const copyImage = async (page: Page, png: Buffer) =>
  page.evaluate(
    async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    },
    [...png],
  );

test("a pasted screenshot is read right after the scan dialog opens", async ({ page, browser }) => {
  await setUpCompany(page);
  const { dialog, scan } = await openScan(page);
  await copyImage(page, await qrPng(browser, QR.totp.rows));
  await page.keyboard.press("Control+V");
  await expect(scan).toBeHidden({ timeout: 5_000 });
  await expect(dialog.getByLabel("Einmalcode", { exact: true })).toHaveValue(QR.totp.text);
});

// Control: the same paste works once the focus is inside the dialog's body
test("control: the paste is read with the focus on the image chooser", async ({
  page,
  browser,
}) => {
  await setUpCompany(page);
  const { dialog, scan } = await openScan(page);
  await copyImage(page, await qrPng(browser, QR.totp.rows));
  await scan.getByLabel("Bild wählen").focus();
  await page.keyboard.press("Control+V");
  await expect(scan).toBeHidden({ timeout: 5_000 });
  await expect(dialog.getByLabel("Einmalcode", { exact: true })).toHaveValue(QR.totp.text);
});
