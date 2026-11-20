/**
 * The MV3 manifest for Chrome/Edge and for Firefox, from one place. Name and description come from
 * _locales (German by default, English), the only texts the browser and the stores read themselves;
 * everything the popup shows comes from Paraglide like in the web app.
 */
import type { ManifestV3Export } from "@crxjs/vite-plugin";

export type Browser = "chrome" | "firefox";

/** Fixed, so Firefox keeps the extension's storage and permissions across reinstalls */
export const GECKO_ID = "extension@kennwort.app";
const WORKER = "src/background.ts";

/**
 * No remote code, no eval, no inline scripts: only the extension's own files run on its pages,
 * and nothing may embed them yet (K-403 opens the inline menu frame to web pages on its own terms)
 */
export const CONTENT_SECURITY_POLICY =
  "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const common = {
  manifest_version: 3,
  name: "__MSG_extension_name__",
  description: "__MSG_extension_description__", // i18n-ignore: a reference into _locales
  default_locale: "de",
  version: "0.0.0",
  action: { default_popup: "popup.html", default_title: "__MSG_extension_action__" },
  // Only the session area for unlocked keys; host access comes with filling in (K-403)
  permissions: ["storage"],
  content_security_policy: { extension_pages: CONTENT_SECURITY_POLICY },
};

/**
 * Firefox differs in two places: it runs the background as an event page from `background.scripts`
 * instead of `service_worker`, which it does not support for extensions, and it wants a fixed ID
 * in `browser_specific_settings.gecko`. 140 (the current ESR) is the first version that reads
 * `data_collection_permissions`, which addons.mozilla.org requires; `storage.session` came in 115.
 */
export const manifest = (browser: Browser): ManifestV3Export =>
  browser === "firefox"
    ? {
        ...common,
        background: { scripts: [WORKER] },
        browser_specific_settings: {
          gecko: {
            id: GECKO_ID,
            strict_min_version: "140.0",
            // Nothing leaves the device yet; the sync (K-402) sends only ciphertext to the
            // company's own server and has to look at this again
            data_collection_permissions: { required: ["none"] },
          },
        },
      }
    : { ...common, background: { service_worker: WORKER, type: "module" } };
