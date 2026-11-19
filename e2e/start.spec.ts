import { expect, test } from "@playwright/test";

// The page follows the browser's language and falls back to German, the base locale
const cases = [
  { locale: "de-DE", lang: "de", text: "nur für euch lesbar" },
  { locale: "en-US", lang: "en", text: "readable only by you" },
  { locale: "fr-FR", lang: "de", text: "nur für euch lesbar" },
];

test.describe("start page", { tag: "@phone" }, () => {
  for (const { locale, lang, text } of cases) {
    test.describe(`in a browser set to ${locale}`, () => {
      test.use({ locale });

      test(`speaks ${lang}`, async ({ page }) => {
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kennwort");
        await expect(page.getByText(text)).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
      });
    });
  }
});
