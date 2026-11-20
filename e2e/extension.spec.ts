import { expect, test } from "@playwright/test";
import texts from "../apps/extension/src/popup/popup.test-data.json" with { type: "json" };
import { collectErrors, expectNoAxeViolations, extensionId, launchExtension } from "./extension.ts";

// K-401: the release build of the extension loaded into a real Chromium; until an account is
// connected (K-402) its popup asks for the server and the account
const cases = [
  { locale: "de-DE", colorScheme: "light", text: texts.de },
  { locale: "en-US", colorScheme: "dark", text: texts.en },
] as const;

for (const { locale, colorScheme, text } of cases) {
  test(`the popup asks to connect in ${locale}, ${colorScheme}, and axe finds nothing`, async () => {
    const { context, close } = await launchExtension(locale, colorScheme);
    try {
      const page = await context.newPage();
      const errors = collectErrors(page);
      await page.goto(`chrome-extension://${await extensionId(context)}/popup.html`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(text.connectTitle);
      for (const label of [text.server, text.accountId, text.secretKey, text.passphrase])
        await expect(page.getByLabel(label, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: text.connect })).toBeVisible();
      await expectNoAxeViolations(page);
      expect(errors).toEqual([]);
    } finally {
      await close();
    }
  });
}
