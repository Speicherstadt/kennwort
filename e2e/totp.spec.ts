import { createHmac } from "node:crypto";
import { expect } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";

// K-306 part 4: a login keeps its one-time code key; the detail shows the code, never the key
test.use({ locale: "de-DE" });

/** RFC 6238 with SHA-1 and six digits, on Node's own HMAC, to check the app against */
const expectedCode = (key: Buffer, ms: number) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(ms / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = (mac.at(-1) as number) & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
};
// JBSWY3DPEHPK3PXP in Base32
const KEY = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);

test.describe("one-time codes", { tag: "@phone" }, () => {
  test("Jonas adds the DATEV key to a login and copies the current code", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setUpCompany(page);
    await page
      .getByRole("button", { name: "Neu", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Neuer Eintrag" });
    await dialog.getByLabel("Titel").fill("DATEV");
    await dialog.getByLabel("Benutzername").fill("jonas");
    const key = dialog.getByLabel("Einmalcode", { exact: true });
    await key.fill("kein schlüssel");
    await expect(dialog.getByText("Kein gültiger Schlüssel für Einmalcodes")).toBeVisible();
    await key.fill("otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV");
    await expect(dialog.getByText("Der Schlüssel oder der otpauth-Link")).toBeVisible();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    // Five seconds into the next step, so the code holds 25 seconds; near enough to the real
    // time for the server's clock checks
    const at = (Math.floor(Date.now() / 30_000) + 1) * 30_000 + 5_000;
    await page.clock.setFixedTime(at);
    const code = expectedCode(KEY, at);
    const fields = page.getByRole("region", { name: "Felder" });
    await expect(fields).toContainText(`${code.slice(0, 3)} ${code.slice(3)}`);
    await expect(fields).toContainText("noch 25 s");
    await expect(fields).not.toContainText("JBSWY3DP");

    await page.getByRole("button", { name: "Einmalcode kopieren" }).click();
    await expect(page.getByText("Einmalcode kopiert")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  });
});
