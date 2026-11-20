import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { QR, qrPng, qrY4m } from "./qr.ts";

// K-306 part 4b: the one-time code key comes from the service's setup QR code, scanned with the
// camera or read from a screenshot
test.use({ locale: "de-DE" });

const openNewLogin = async (page: Page) => {
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Neuer Eintrag" });
  await dialog.getByLabel("Titel").fill("DATEV");
  await dialog.getByRole("button", { name: "QR-Code scannen" }).click();
  return { dialog, scan: page.getByRole("dialog", { name: "QR-Code scannen" }) };
};

test.describe("QR scan", { tag: "@phone" }, () => {
  test("Jonas reads the DATEV setup code from a screenshot; another QR code is refused", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const { dialog, scan } = await openNewLogin(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    const choose = scan.getByLabel("Bild wählen");
    await choose.setInputFiles({
      name: "website.png",
      mimeType: "image/png",
      buffer: await qrPng(browser, QR.website.rows),
    });
    await expect(scan.getByRole("alert")).toHaveText(
      "Dieser QR-Code enthält keinen Schlüssel für Einmalcodes.",
    );
    await choose.setInputFiles({
      name: "datev.png",
      mimeType: "image/png",
      buffer: await qrPng(browser, QR.totp.rows),
    });
    await expect(scan).toBeHidden();
    await expect(dialog.getByLabel("Einmalcode", { exact: true })).toHaveValue(QR.totp.text);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Felder" })).toContainText(/\d{3} \d{3}/);
  });
});

// Chromium's fake camera plays a video file; that needs a browser of its own with these flags,
// so this one runs on the desktop only
test("Jonas scans the DATEV setup code with the camera", async () => {
  const video = join(tmpdir(), `kennwort-qr-${process.pid}-${Date.now()}.y4m`);
  writeFileSync(video, qrY4m(QR.totp.rows));
  const executablePath = process.env.CHROMIUM_PATH;
  const baseURL = test.info().project.use.baseURL;
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
    ],
  });
  try {
    const context = await browser.newContext({
      ...(baseURL ? { baseURL } : {}),
      locale: "de-DE",
      permissions: ["camera"],
      extraHTTPHeaders: { "x-forwarded-for": `10.251.${test.info().parallelIndex}.1` },
    });
    const page = await context.newPage();
    await setUpCompany(page);
    const { dialog, scan } = await openNewLogin(page);
    await scan.getByRole("button", { name: "Kamera verwenden" }).click();
    await expect(scan).toBeHidden({ timeout: 15_000 });
    await expect(dialog.getByLabel("Einmalcode", { exact: true })).toHaveValue(QR.totp.text);
  } finally {
    await browser.close();
    rmSync(video, { force: true });
  }
});
