/**
 * The MV3 manifest for Chrome/Edge and for Firefox, from one place. Name and description come from
 * _locales (German by default, English), the only texts the browser and the stores read themselves;
 * everything the popup shows comes from Paraglide like in the web app.
 */
import type { ManifestV3Export } from "@crxjs/vite-plugin";
import { MENU_PAGE } from "./fill/messages.ts";
import { PROMPT_PAGE } from "./save/messages.ts";

/** The manifest as an object (ManifestV3Export also allows a function or a promise) */
type ManifestV3 = Extract<ManifestV3Export, { manifest_version: number }>;

export type Browser = "chrome" | "firefox";

/**
 * Only for the end-to-end tests (`vite build --mode e2e`): activeTab reveals the tab's address only
 * after a real click on the extension's button, which Playwright cannot make, so the test build may
 * read the addresses of the test pages under .test instead. A release never carries it.
 */
export const E2E_HOSTS = ["https://*.test/*"];

/** Fixed, so Firefox keeps the extension's storage and permissions across reinstalls */
export const GECKO_ID = "extension@kennwort.app";
const WORKER = "src/background.ts";

/**
 * No remote code, no eval, no inline scripts: only the extension's own files run on its pages.
 * Web pages may frame them (the inline menu and the save prompt sit in the page, K-403, K-404), but
 * a page reaches only what web_accessible_resources lists: those two pages, never the popup.
 */
export const CONTENT_SECURITY_POLICY =
  "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors https: http:";

/** Where the content script runs and the menu may be framed: every web page (K-403) */
export const WEB_PAGES = ["https://*/*", "http://*/*"];

/**
 * The content script places the inline menu under login fields in every frame; it holds no secret
 * and decides nothing about filling (src/content/main.ts). It is not given file:, data: or
 * about:blank frames.
 */
const contentScripts = [
  { matches: WEB_PAGES, js: ["src/content/main.ts"], all_frames: true, run_at: "document_idle" },
];

const common = {
  manifest_version: 3,
  name: "__MSG_extension_name__",
  description: "__MSG_extension_description__", // i18n-ignore: a reference into _locales
  default_locale: "de",
  version: "0.0.0",
  action: { default_popup: "popup.html", default_title: "__MSG_extension_action__" },
  // The session area for unlocked keys, the lock alarm, the address of the active tab only after
  // a click on the button (activeTab), and the browser's frame tree, from which the service worker
  // learns which frame a menu sits in and what address it has when it fills (webNavigation, K-403)
  permissions: ["storage", "alarms", "activeTab", "webNavigation"],
  content_scripts: contentScripts,
  content_security_policy: { extension_pages: CONTENT_SECURITY_POLICY },
};

/**
 * The menu page and the save prompt's page are the only pages web pages may load (crxjs adds the
 * content script's own chunks). In Chrome under an address that changes each browser session
 * (use_dynamic_url), so a page cannot frame them by an address it knows; Firefox gives each
 * installation its own random address anyway. A menu or prompt framed without the content script's
 * nonce fills, takes and saves nothing (fill/messages.ts, save/messages.ts).
 */
const FRAMED_PAGES = [MENU_PAGE, PROMPT_PAGE];
const menuResource = (browser: Browser) => [
  browser === "chrome"
    ? { resources: FRAMED_PAGES, matches: WEB_PAGES, use_dynamic_url: true }
    : { resources: FRAMED_PAGES, matches: WEB_PAGES },
];

/**
 * Firefox differs in two places: it runs the background as an event page from `background.scripts`
 * instead of `service_worker`, which it does not support for extensions, and it wants a fixed ID
 * in `browser_specific_settings.gecko`. 140 (the current ESR) is the first version that reads
 * `data_collection_permissions`, which addons.mozilla.org requires; `storage.session` came in 115.
 */
const forBrowser = (browser: Browser): ManifestV3 =>
  browser === "firefox"
    ? {
        ...common,
        web_accessible_resources: menuResource(browser),
        background: { scripts: [WORKER] },
        browser_specific_settings: {
          gecko: {
            id: GECKO_ID,
            strict_min_version: "140.0",
            // Nothing goes to the developer or a third party: the popup talks only to the
            // company's own server, which the user enters, and sends it only ciphertexts, public
            // keys and a signature (P-02, P-15); the address of the tab never leaves the popup
            data_collection_permissions: { required: ["none"] },
          },
        },
      }
    : {
        ...common,
        web_accessible_resources: menuResource(browser),
        background: { service_worker: WORKER, type: "module" },
      };

export const manifest = (browser: Browser, e2e = false): ManifestV3Export =>
  e2e ? { ...forBrowser(browser), host_permissions: E2E_HOSTS } : forBrowser(browser);
