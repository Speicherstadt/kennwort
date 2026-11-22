/**
 * The MV3 manifest for Chrome/Edge, Firefox and Safari, from one place. Name and description come
 * from _locales (German by default, English), the only texts the browser and the stores read
 * themselves; everything the popup shows comes from Paraglide like in the web app.
 */
import type { ManifestV3Export } from "@crxjs/vite-plugin";
import { MENU_PAGE } from "./fill/messages.ts";
import { PROMPT_PAGE } from "./save/messages.ts";

/** The manifest as an object (ManifestV3Export also allows a function or a promise) */
type ManifestV3 = Extract<ManifestV3Export, { manifest_version: number }>;

/**
 * Chrome and Edge; Firefox on the desktop and on Android; Safari on macOS and iOS (K-407). Safari's
 * build is the folder `xcrun safari-web-extension-converter` wraps into an app (docs/extension.md).
 */
export const BROWSERS = ["chrome", "firefox", "safari"] as const;
export type Browser = (typeof BROWSERS)[number];

/**
 * The oldest versions with every API and key the extension relies on (MDN browser-compat-data
 * 8.1.10): Firefox 140 (the current ESR) is the first to read `data_collection_permissions`, which
 * addons.mozilla.org requires, Firefox for Android only 142; Safari 18 is the first that runs a
 * content script in the page's world (`world: "MAIN"`, the passkeys, K-406).
 */
export const FIREFOX_MIN_VERSION = "140.0";
export const FIREFOX_ANDROID_MIN_VERSION = "142.0";
export const SAFARI_MIN_VERSION = "18.0";

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
  // The passkey provider (K-406), before any script of the page: in the page's own world in place
  // of navigator.credentials (passkey/page-api.ts), and beside it the content script that passes a
  // ceremony to the service worker (passkey/channel.ts). Self-contained IIFEs (crxjs), so they run
  // at once and not after a module loads.
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
 * (use_dynamic_url), so a page cannot frame them by an address it knows. Firefox does not read the
 * key: it gives each profile its own random address, which stays until the extension is
 * reinstalled; Safari changes its address with every launch on its own (docs/sicherheitsdesign.md,
 * P-17). A menu or prompt framed without the content script's nonce fills, takes and saves nothing
 * (fill/messages.ts, save/messages.ts).
 */
const FRAMED_PAGES = [MENU_PAGE, PROMPT_PAGE];
const menuResource = (browser: Browser) => [
  browser === "chrome"
    ? { resources: FRAMED_PAGES, matches: WEB_PAGES, use_dynamic_url: true }
    : { resources: FRAMED_PAGES, matches: WEB_PAGES },
];

const serviceWorker = { service_worker: WORKER, type: "module" } as const;

/**
 * Firefox runs the background as an event page from `background.scripts` instead of
 * `service_worker`, which it does not support for extensions, and wants a fixed ID in
 * `browser_specific_settings.gecko`; `gecko_android` offers the same build on Android.
 */
const firefox = {
  background: { scripts: [WORKER] },
  browser_specific_settings: {
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      // Nothing goes to the developer or a third party: the popup talks only to the company's own
      // server, which the user enters, and sends it only ciphertexts, public keys and a signature
      // (P-02, P-15); the address of the tab never leaves the popup
      data_collection_permissions: { required: ["none"] },
    },
    gecko_android: { strict_min_version: FIREFOX_ANDROID_MIN_VERSION },
  },
};

/** Safari runs the same service worker as Chrome; the app around it carries its identity */
const safari = {
  background: serviceWorker,
  browser_specific_settings: { safari: { strict_min_version: SAFARI_MIN_VERSION } },
};

// crxjs types browser_specific_settings with gecko only; Safari's and gecko_android are read by
// the browsers that know them (MDN, browser_specific_settings)
const PER_BROWSER = {
  chrome: { background: serviceWorker },
  firefox,
  safari,
} as unknown as Record<Browser, Pick<ManifestV3, "background" | "browser_specific_settings">>;

const forBrowser = (browser: Browser): ManifestV3 => ({
  ...common,
  web_accessible_resources: menuResource(browser),
  ...PER_BROWSER[browser],
});

export const manifest = (browser: Browser, e2e = false): ManifestV3Export =>
  e2e ? { ...forBrowser(browser), host_permissions: E2E_HOSTS } : forBrowser(browser);
