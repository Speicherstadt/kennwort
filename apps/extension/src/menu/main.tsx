import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { browserAlarms } from "../account/auto-lock.ts";
import { createPopupAccount } from "../account/popup-account.ts";
import { serverApiFor } from "../account/server-api.ts";
import type { MenuAnswer, MenuRequest } from "../fill/messages.ts";
import { browserSessionArea, KEYS_ITEM } from "../session-keys.ts";
import { InlineMenu } from "./inline-menu.tsx";
import { tracksVisibility } from "./visibility.ts";

// The inline menu's page (K-403), framed by the content script with its nonce in the fragment.
// Language and light or dark follow the browser, as in the popup (popup/main.tsx).
type Runtime = { sendMessage(message: MenuRequest): Promise<MenuAnswer | undefined> };
const runtime = (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime;
const root = document.getElementById("root");

if (root && runtime) {
  document.documentElement.lang = getLocale();
  const area = browserSessionArea();
  const account = createPopupAccount({
    area,
    alarms: browserAlarms(),
    apiFor: serverApiFor((input, init) => fetch(input, init), navigator.userAgent),
    movesLock: false,
  });
  const request = (message: MenuRequest) => runtime.sendMessage(message).catch(() => undefined);
  render(
    () => (
      <InlineMenu
        account={account}
        bridge={{
          nonce: location.hash.slice(1),
          request,
          now: () => performance.now(),
          verifiable: tracksVisibility(),
        }}
      />
    ),
    root,
  );
  // Unlocked or locked in the popup meanwhile: the menu opens again with what is there now
  area?.onChanged?.addListener((changes) => {
    if (KEYS_ITEM in changes) location.reload();
  });
}
