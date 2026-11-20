import { expect } from "@playwright/test";
import { test } from "./account.ts";

// The app follows the browser's language and falls back to German, the base locale
const cases = [
  { locale: "de-DE", lang: "de", title: "Alle Einträge", nav: "Hauptnavigation" },
  { locale: "en-US", lang: "en", title: "All entries", nav: "Main navigation" },
  { locale: "fr-FR", lang: "de", title: "Alle Einträge", nav: "Hauptnavigation" },
];

test.describe("start page", { tag: "@phone" }, () => {
  for (const { locale, lang, title, nav } of cases) {
    test.describe(`in a browser set to ${locale}`, () => {
      test.use({ locale });

      test(`speaks ${lang}`, async ({ page, open }) => {
        await open("/");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        await expect(page.getByRole("navigation", { name: nav }).first()).toBeAttached();
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
      });
    });
  }
});
