/**
 * Reads what the app copied. The app's Permissions-Policy denies clipboard-read (it never reads the
 * clipboard, P-16), so the test reads it from a page of its own at the same origin, answered by the
 * test without the app's headers.
 */
import type { BrowserContext } from "@playwright/test";

const READER = "/__e2e-clipboard-reader";

export const readClipboard = async (context: BrowserContext, origin: string) => {
  const reader = await context.newPage();
  try {
    await reader.route(`**${READER}`, (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>reader</title>" }),
    );
    await reader.goto(new URL(READER, origin).href);
    await reader.bringToFront();
    return await reader.evaluate(() => navigator.clipboard.readText());
  } finally {
    await reader.close();
  }
};
