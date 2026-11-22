/**
 * Which build of the extension each engine runs, and what that browser offers (K-407): Firefox
 * has no setAccessLevel and, on Android, no windows API; Safari has both (macOS), as Chrome does.
 */
import type { TestInfo } from "@playwright/test";
import type { ApiOptions } from "./browser-api.ts";

export type Build = "chrome" | "firefox" | "safari";

const BUILD_OF: Record<string, Build> = {
  chromium: "chrome",
  firefox: "firefox",
  webkit: "safari",
};

export const buildOf = (info: TestInfo): Build => BUILD_OF[info.project.name] ?? "chrome";

/** The scheme the browser serves the extension's pages under (MDN, web_accessible_resources) */
export const EXTENSION_ORIGIN: Record<Build, string> = {
  chrome: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
  firefox: "moz-extension://0f8d3a4e-7b1c-4c3e-9a51-2d6f8e9b7c10",
  safari: "safari-web-extension://E2C2B5A3-2D69-4D6A-B8A3-9E1F5C8F2C41",
};

/** Firefox as on Android: neither setAccessLevel nor windows */
export const apiOf = (build: Build): Omit<ApiOptions, "pageUrl"> =>
  build === "firefox"
    ? { accessLevel: false, windows: false }
    : { accessLevel: true, windows: true };
