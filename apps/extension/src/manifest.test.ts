import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU_PAGE } from "./fill/messages.ts";
import {
  BROWSERS,
  type Browser,
  CONTENT_SECURITY_POLICY,
  E2E_HOSTS,
  FIREFOX_ANDROID_MIN_VERSION,
  FIREFOX_MIN_VERSION,
  GECKO_ID,
  manifest,
  SAFARI_MIN_VERSION,
  WEB_PAGES,
} from "./manifest.ts";
import { PROMPT_PAGE } from "./save/messages.ts";

type Manifest = Record<string, unknown> & {
  background: Record<string, unknown>;
  permissions: string[];
  content_scripts: Record<string, unknown>[];
  web_accessible_resources: Record<string, unknown>[];
};
const built = (browser: Browser) => manifest(browser) as unknown as Manifest;
const locales = join(import.meta.dirname, "..", "public", "_locales");
const messages = (locale: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(join(locales, locale, "messages.json"), "utf8"));

describe.each(BROWSERS)("the manifest for %s", (browser) => {
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
      // K-406: the passkey provider, before the page's own scripts: the page's world takes the
      // place of navigator.credentials, the content script beside it passes ceremonies on
      {
        matches: WEB_PAGES,
        js: ["src/content/passkey-page.iife.ts"],
        all_frames: true,
        run_at: "document_start",
        world: "MAIN",
      },
      {
        matches: WEB_PAGES,
        js: ["src/content/passkey-bridge.iife.ts"],
        all_frames: true,
        run_at: "document_start",
      },
    ]);
    expect(WEB_PAGES).toEqual(["https://*/*", "http://*/*"]);
    expect(JSON.stringify(built(browser).content_scripts)).not.toMatch(
      /about|file|data|<all_urls>/,
    );
  });

  it("lets web pages load the menu and the save prompt and nothing else of the extension", () => {
    const resources = built(browser).web_accessible_resources;
    expect(resources.flatMap((entry) => entry.resources)).toEqual([MENU_PAGE, PROMPT_PAGE]);
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
    // Only web pages may frame them (the inline menu, K-403, the save prompt, K-404); scripts still come from the extension
    const directives = CONTENT_SECURITY_POLICY.split(";").map((part) => part.trim());
    expect(directives.filter((part) => /http/.test(part))).toEqual([
      "frame-ancestors https: http:",
    ]);
  });
});

it("serves menu and prompt in Chrome under an address that changes each session", () => {
  expect(built("chrome").web_accessible_resources).toEqual([
    { resources: [MENU_PAGE, PROMPT_PAGE], matches: WEB_PAGES, use_dynamic_url: true },
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

// K-407: Firefox for Android installs only what names gecko_android; 142 is the first Android
// version that reads data_collection_permissions (addons-linter, KEY_FIREFOX_ANDROID_UNSUPPORTED…)
it("offers the Firefox build on Android too, from the version that reads every key", () => {
  expect(built("firefox").browser_specific_settings).toEqual({
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      data_collection_permissions: { required: ["none"] },
    },
    gecko_android: { strict_min_version: FIREFOX_ANDROID_MIN_VERSION },
  });
  expect([FIREFOX_MIN_VERSION, FIREFOX_ANDROID_MIN_VERSION]).toEqual(["140.0", "142.0"]);
});

// K-407: Safari runs MV3 service workers (15.4), module workers (16.4), setAccessLevel on the
// session area (17.1) and content scripts in the page's world (18), which the passkeys need
// (MDN browser-compat-data 8.1.10)
it("runs the background as a module service worker in Safari, from Safari 18", () => {
  expect(built("safari").background).toEqual({
    service_worker: "src/background.ts",
    type: "module",
  });
  expect(built("safari").browser_specific_settings).toEqual({
    safari: { strict_min_version: SAFARI_MIN_VERSION },
  });
  expect(SAFARI_MIN_VERSION).toBe("18.0");
});

// Safari's base URL changes with every launch anyway (MDN, web_accessible_resources); Firefox has
// no use_dynamic_url and gives each profile its own random address instead
it.each(["firefox", "safari"] as const)("carries no key only Chrome reads into %s", (browser) => {
  expect(built(browser).web_accessible_resources).toEqual([
    { resources: [MENU_PAGE, PROMPT_PAGE], matches: WEB_PAGES },
  ]);
  expect(JSON.stringify(built(browser))).not.toContain("use_dynamic_url");
});

it("gives every browser the same permissions, content scripts, texts and policy", () => {
  const shared = (browser: Browser) => {
    const { background, browser_specific_settings, web_accessible_resources, ...rest } =
      built(browser);
    return rest;
  };
  expect(shared("firefox")).toEqual(shared("chrome"));
  expect(shared("safari")).toEqual(shared("chrome"));
  expect(built("safari")).not.toHaveProperty("browser_specific_settings.gecko");
  expect(built("chrome")).not.toHaveProperty("browser_specific_settings");
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
