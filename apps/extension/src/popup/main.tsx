import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { browserAlarms } from "../account/auto-lock.ts";
import { createPopupAccount } from "../account/popup-account.ts";
import { serverApiFor } from "../account/server-api.ts";
import { browserTabs, currentPageUrl } from "../page/current-page.ts";
import { browserSessionArea } from "../session-keys.ts";
import { Popup } from "./popup.tsx";

// German or English by the browser's language only: the extension's Paraglide runtime keeps no
// chosen language (build/paraglide.ts), unlike the web app's, which remembers one.
// Light or dark follows the system for the same reason: a remembered choice would need a store
// besides the session area, and the extension keeps none (build/storage-rules.ts).
const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  const account = createPopupAccount({
    area: browserSessionArea(),
    alarms: browserAlarms(),
    apiFor: serverApiFor((input, init) => fetch(input, init), navigator.userAgent),
  });
  render(() => <Popup account={account} pageUrl={() => currentPageUrl(browserTabs())} />, root);
}
