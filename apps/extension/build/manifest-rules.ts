/**
 * What each browser's built manifest must and must not carry (K-407). crxjs rewrites the manifest
 * of src/manifest.ts while it builds (file names, the content script's chunks), so the unit tests
 * of src/manifest.ts alone do not see what ships; build/check-bundle.ts applies these rules to
 * dist/<build>/manifest.json after every build.
 */
import { MENU_PAGE } from "../src/fill/messages.ts";
import { type Browser, E2E_HOSTS, GECKO_ID } from "../src/manifest.ts";
import { PROMPT_PAGE } from "../src/save/messages.ts";

type Json = Record<string, unknown>;

/** The release set; a build that asks for more fails */
export const PERMISSIONS = ["storage", "alarms", "activeTab", "webNavigation"];

const asObject = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};

const resourcesOf = (manifest: Json) =>
  (Array.isArray(manifest.web_accessible_resources) ? manifest.web_accessible_resources : []).map(
    asObject,
  );

/** Permissions, hosts and the pages a website may load: the same for every browser */
const commonProblems = (manifest: Json, e2e: boolean): string[] => {
  const problems: string[] = [];
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(PERMISSIONS))
    problems.push(`permissions differ from ${PERMISSIONS.join(", ")}`);
  if ("optional_permissions" in manifest || "optional_host_permissions" in manifest)
    problems.push("optional permissions");
  const hosts = e2e ? JSON.stringify(E2E_HOSTS) : undefined;
  if (JSON.stringify(manifest.host_permissions) !== hosts)
    problems.push(e2e ? "host permissions other than the test pages" : "host permissions");
  if (JSON.stringify(manifest).includes("<all_urls>")) problems.push("<all_urls>");
  const resources = resourcesOf(manifest).flatMap((entry) =>
    Array.isArray(entry.resources) ? entry.resources : [],
  );
  if (resources.some((name) => /popup|\*/.test(String(name))))
    problems.push("a website may load the popup or every file");
  return problems;
};

const hasDynamicUrl = (manifest: Json) =>
  resourcesOf(manifest).some((entry) => "use_dynamic_url" in entry);

/** Chrome serves the two pages a website may frame under its per-session address */
const framedPagesDynamic = (manifest: Json) => {
  const framed = resourcesOf(manifest).filter(
    (entry) =>
      Array.isArray(entry.resources) &&
      entry.resources.some((name) => name === MENU_PAGE || name === PROMPT_PAGE),
  );
  return framed.length > 0 && framed.every((entry) => entry.use_dynamic_url === true);
};

/** The keys only one browser reads, and what each needs to run at all */
const browserProblems = (browser: Browser, manifest: Json): string[] => {
  const background = asObject(manifest.background);
  const settings = asObject(manifest.browser_specific_settings);
  const problems: string[] = [];
  if (browser === "firefox") {
    if (!Array.isArray(background.scripts) || "service_worker" in background)
      problems.push("Firefox needs background.scripts and no service_worker");
    if (asObject(settings.gecko).id !== GECKO_ID) problems.push("no fixed gecko id");
    if (!("gecko_android" in settings)) problems.push("not offered on Firefox for Android");
    if ("safari" in settings) problems.push("Safari's settings in Firefox");
  } else {
    if (typeof background.service_worker !== "string" || "scripts" in background)
      problems.push(`${browser} needs background.service_worker and no scripts`);
    if ("gecko" in settings || "gecko_android" in settings)
      problems.push(`Firefox's settings in ${browser}`);
  }
  if (browser === "safari" && !("safari" in settings)) problems.push("no Safari minimum version");
  if (browser === "chrome" && "browser_specific_settings" in manifest)
    problems.push("browser_specific_settings in Chrome");
  if (browser !== "chrome" && hasDynamicUrl(manifest))
    problems.push(`use_dynamic_url, which only Chrome reads, in ${browser}`);
  if (browser === "chrome" && !framedPagesDynamic(manifest))
    problems.push("menu or prompt without use_dynamic_url");
  return problems;
};

/** Every problem of one built manifest; `e2e` allows the test hosts of the end-to-end build */
export const manifestProblems = (browser: Browser, manifest: unknown, e2e = false): string[] => [
  ...commonProblems(asObject(manifest), e2e),
  ...browserProblems(browser, asObject(manifest)),
];
