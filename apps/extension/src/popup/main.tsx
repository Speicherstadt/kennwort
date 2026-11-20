import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { LockedScreen } from "./locked-screen.tsx";

// German or English by the browser's language, as in the web app (Paraglide's preferredLanguage).
// Light or dark follows the system: a remembered choice would need a store besides the session
// area, and the extension keeps none (src/storage-guard.test.ts).
const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  render(() => <LockedScreen />, root);
}
