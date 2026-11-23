/**
 * The CSP and the security headers (docs/sicherheitsdesign.md, P-16): the e2e server serves the web
 * build itself, with the headers of production (playwright.config.ts). A person sets up a company,
 * writes an entry, opens the generator, locks by reloading, unlocks and opens a one-time link's
 * page, and no CSP violation and no console error happens on the way. An inline script injected at
 * the end is refused: the policy is enforced, not only sent. With the service worker, a page it
 * serves from its verified caches carries the same policy.
 */
import { expect, type Page, type Response, test } from "@playwright/test";
import { appHeaders } from "../packages/core/src/headers/security-headers.ts";
import { setUpCompany, unlock } from "./account.ts";
import { addEntry, goInApp, unique } from "./entries.ts";

test.use({ locale: "de-DE" });

type Violation = { directive: string; blocked: string };
declare global {
  interface Window {
    kennwortViolations?: Violation[];
    kennwortInlineRan?: boolean;
  }
}

/** Collects every CSP violation of every page load, and every console error and page error */
const watch = async (page: Page) => {
  await page.addInitScript(() => {
    window.kennwortViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.kennwortViolations?.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      }),
    );
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return {
    errors,
    violations: () => page.evaluate(() => window.kennwortViolations ?? []),
  };
};

const expectAppHeaders = (response: Response | null) => {
  const headers = response?.headers() ?? {};
  for (const [name, value] of Object.entries(appHeaders({ secure: false }))) {
    expect([name, headers[name]]).toEqual([name, value]);
  }
};

test("the app works under its CSP without a single violation", { tag: "@phone" }, async ({
  page,
}) => {
  const seen = await watch(page);
  expectAppHeaders(await page.goto("/setup"));
  await setUpCompany(page);
  const title = unique("DATEV");
  await addEntry(page, {
    title,
    username: "jonas@weber-haustechnik.de",
    password: "Kessel-Rohr-2026!",
    website: "https://datev.de",
  });
  await goInApp(page, "/generator");
  await expect(page.getByRole("heading", { level: 1, name: "Generator" })).toBeVisible();
  expectAppHeaders(await page.reload());
  await unlock(page);
  await expect(page.getByRole("navigation").first()).toBeAttached();
  expect(await seen.violations()).toEqual([]);

  expectAppHeaders(await page.goto("/s/AAAAAAAAAAAAAAAAAAAAAA#k=AAAA"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors).toEqual([]);

  // An injected inline script never runs; the browser reports it
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.kennwortInlineRan = true";
    document.head.append(script);
  });
  await expect.poll(seen.violations).toEqual([{ directive: "script-src-elem", blocked: "inline" }]);
  expect(await page.evaluate(() => window.kennwortInlineRan)).toBeUndefined();
});

test.describe("with the service worker", () => {
  test.use({ serviceWorkers: "allow" });

  test("a page served from the verified caches carries the same policy", async ({ page }) => {
    const seen = await watch(page);
    await page.goto("/setup");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    expectAppHeaders(response);
    await expect(page.locator("input[type=password]").first()).toBeVisible();
    expect(await seen.violations()).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
});
