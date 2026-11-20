import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU_PAGE } from "./fill/messages.ts";
import { CONTENT_SECURITY_POLICY, E2E_HOSTS, GECKO_ID, manifest, WEB_PAGES } from "./manifest.ts";

type Manifest = Record<string, unknown> & {
  background: Record<string, unknown>;
  permissions: string[];
  content_scripts: Record<string, unknown>[];
  web_accessible_resources: Record<string, unknown>[];
};
const built = (browser: "chrome" | "firefox") => manifest(browser) as unknown as Manifest;
const locales = join(import.meta.dirname, "..", "public", "_locales");
const messages = (locale: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(join(locales, locale, "messages.json"), "utf8"));

describe.each(["chrome", "firefox"] as const)("the manifest for %s", (browser) => {
  it("asks for the session area, the lock alarm, the active tab and the frame tree, no hosts", () => {
    expect(built(browser).permissions).toEqual(["storage", "alarms", "activeTab", "webNavigation"]);
    expect(built(browser)).not.toHaveProperty("host_permissions");
  });

  // K-403: the content script runs in every frame of a web page and only places the menu
  it("runs the content script in every frame of http(s) pages, and nowhere else", () => {
    expect(built(browser).content_scripts).toEqual([
      {
        matches: WEB_PAGES,
        js: ["src/content/main.ts"],
        all_frames: true,
        run_at: "document_idle",
      },
    ]);
    expect(WEB_PAGES).toEqual(["https://*/*", "http://*/*"]);
    expect(JSON.stringify(built(browser).content_scripts)).not.toMatch(
      /about|file|data|<all_urls>/,
    );
  });

  it("lets web pages load the menu page and nothing else of the extension", () => {
    const resources = built(browser).web_accessible_resources;
    expect(resources.flatMap((entry) => entry.resources)).toEqual([MENU_PAGE]);
    expect(resources.every((entry) => entry.matches === WEB_PAGES)).toBe(true);
  });

  it("takes every text from _locales, in German and English", () => {
    const text = JSON.stringify(built(browser));
    const names = [...text.matchAll(/__MSG_(\w+)__/g)].map((match) => match[1] ?? "");
    expect(names).toEqual(
      expect.arrayContaining(["extension_name", "extension_description", "extension_action"]),
    );
    for (const locale of ["de", "en"]) {
      for (const name of names) expect(messages(locale)[name]?.message).toBeTruthy();
    }
    expect(built(browser).default_locale).toBe("de");
  });

  it("allows only the extension's own scripts", () => {
    expect(built(browser).content_security_policy).toEqual({
      extension_pages: CONTENT_SECURITY_POLICY,
    });
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self';");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe|\*/);
    // Only web pages may frame them (the inline menu, K-403); scripts still come from the extension
    const directives = CONTENT_SECURITY_POLICY.split(";").map((part) => part.trim());
    expect(directives.filter((part) => /http/.test(part))).toEqual([
      "frame-ancestors https: http:",
    ]);
  });
});

it("serves the menu page in Chrome under an address that changes each session", () => {
  expect(built("chrome").web_accessible_resources).toEqual([
    { resources: [MENU_PAGE], matches: WEB_PAGES, use_dynamic_url: true },
  ]);
});

it("runs the background as a module service worker in Chrome and Edge", () => {
  expect(built("chrome").background).toEqual({
    service_worker: "src/background.ts",
    type: "module",
  });
  expect(built("chrome")).not.toHaveProperty("browser_specific_settings");
});

it("runs the background from scripts with a fixed ID in Firefox", () => {
  expect(built("firefox").background).toEqual({ scripts: ["src/background.ts"] });
  expect(built("firefox").browser_specific_settings).toMatchObject({ gecko: { id: GECKO_ID } });
});

it("gives only the end-to-end build access to the test pages under .test", () => {
  expect(manifest("chrome", true)).toEqual({ ...manifest("chrome"), host_permissions: E2E_HOSTS });
  expect(E2E_HOSTS).toEqual(["https://*.test/*"]);
});

it("builds a release only without the test hosts (vite.config.ts)", () => {
  const config = readFileSync(join(import.meta.dirname, "..", "vite.config.ts"), "utf8");
  expect(config).toContain('manifest(browser, mode === "e2e")');
  const { scripts } = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  );
  expect(scripts.build).not.toContain("e2e");
});
