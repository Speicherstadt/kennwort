// @vitest-environment node
/**
 * K-407: each browser's manifest carries what that browser needs and nothing only another browser
 * reads, and no build asks for more than the release permissions. The rules run on the manifests
 * of src/manifest.ts here, and on the built ones after every build (build/check-bundle.ts).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BROWSERS, type Browser, E2E_HOSTS, manifest } from "../src/manifest.ts";
import { manifestProblems } from "./manifest-rules.ts";

const extension = join(import.meta.dirname, "..");
const source = (browser: Browser) => manifest(browser) as unknown as Record<string, unknown>;

describe("the manifest rules", () => {
  it.each(BROWSERS)("find nothing wrong with the manifest for %s", (browser) => {
    expect(manifestProblems(browser, source(browser))).toEqual([]);
  });

  it("allow the test hosts only in the end-to-end build", () => {
    const e2e = manifest("chrome", true);
    expect(manifestProblems("chrome", e2e, true)).toEqual([]);
    expect(manifestProblems("chrome", e2e)).toEqual(["host permissions"]);
    expect(manifestProblems("chrome", source("chrome"), true)).toEqual([
      "host permissions other than the test pages",
    ]);
    expect(E2E_HOSTS).toEqual(["https://*.test/*"]);
  });

  it.each([
    ["chrome", { permissions: ["storage", "alarms", "activeTab", "webNavigation", "tabs"] }],
    ["firefox", { optional_permissions: ["history"] }],
    ["safari", { host_permissions: ["https://*/*"] }],
    [
      "safari",
      { web_accessible_resources: [{ resources: ["popup.html"], matches: ["<all_urls>"] }] },
    ],
  ] as const)("catch a widened permission in %s: %j", (browser, change) => {
    expect(manifestProblems(browser, { ...source(browser), ...change })).not.toEqual([]);
  });

  it.each([
    [
      "firefox",
      "chrome",
      [
        "Firefox needs background.scripts and no service_worker",
        "no fixed gecko id",
        "not offered on Firefox for Android",
        "use_dynamic_url, which only Chrome reads, in firefox",
      ],
    ],
    [
      "firefox",
      "safari",
      [
        "Firefox needs background.scripts and no service_worker",
        "no fixed gecko id",
        "not offered on Firefox for Android",
        "Safari's settings in Firefox",
      ],
    ],
    [
      "safari",
      "firefox",
      [
        "safari needs background.service_worker and no scripts",
        "Firefox's settings in safari",
        "no Safari minimum version",
      ],
    ],
    [
      "safari",
      "chrome",
      ["no Safari minimum version", "use_dynamic_url, which only Chrome reads, in safari"],
    ],
    [
      "chrome",
      "firefox",
      [
        "chrome needs background.service_worker and no scripts",
        "Firefox's settings in chrome",
        "browser_specific_settings in Chrome",
        "menu or prompt without use_dynamic_url",
      ],
    ],
    [
      "chrome",
      "safari",
      ["browser_specific_settings in Chrome", "menu or prompt without use_dynamic_url"],
    ],
  ] as const)("catch the %s build with the keys of %s", (browser, other, expected) => {
    expect(manifestProblems(browser, source(other))).toEqual(expected);
  });

  it("catch a Chrome build whose menu lost its per-session address", () => {
    const flat = {
      ...source("chrome"),
      web_accessible_resources: source("firefox").web_accessible_resources,
    };
    expect(manifestProblems("chrome", flat)).toEqual(["menu or prompt without use_dynamic_url"]);
  });

  it("catch a Firefox build that Firefox for Android would not install", () => {
    const desktop = structuredClone(source("firefox")) as {
      browser_specific_settings: Record<string, unknown>;
    };
    delete desktop.browser_specific_settings.gecko_android;
    expect(manifestProblems("firefox", desktop)).toEqual(["not offered on Firefox for Android"]);
  });
});

describe("the built manifests", () => {
  it.each(["firefox", "safari"] as const)(
    "follow the rules for %s once crxjs has written them",
    (browser) => {
      const out = mkdtempSync(join(tmpdir(), `kennwort-${browser}-`));
      try {
        execFileSync("bunx", ["vite", "build", "--mode", browser, "--outDir", out], {
          cwd: extension,
          stdio: "pipe",
        });
        const built = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
        expect(manifestProblems(browser, built)).toEqual([]);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
