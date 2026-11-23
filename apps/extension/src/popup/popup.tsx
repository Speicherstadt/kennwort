/**
 * The popup (K-402): connect, unlock, or the open account, in the frame of DESIGN.md. Which one
 * follows the account in the session area (account/popup-account.ts); the page's host comes from
 * the active tab once the popup is open (page/current-page.ts).
 */

import { pageHost } from "@kennwort/client/autofill/matches.ts";
import { createToasts } from "@kennwort/ui";
import { createSignal, Match, onSettled, Show, Switch } from "solid-js";
import type { PopupAccount } from "../account/popup-account.ts";
import { ConnectScreen } from "./connect-screen.tsx";
import { LockedScreen } from "./locked-screen.tsx";
import { Shell } from "./shell.tsx";
import { VaultScreen } from "./vault-screen.tsx";

export const Popup = (props: {
  account: PopupAccount;
  /** The address of the page in the active tab, if the browser reveals it */
  pageUrl: () => Promise<string | undefined>;
}) => {
  const toasts = createToasts();
  const [host, setHost] = createSignal<string>();
  onSettled(() => {
    void props.account.restore();
    void props.pageUrl().then((url) => setHost(pageHost(url)));
  });
  return (
    <Shell
      toasts={toasts}
      onLock={props.account.phase() === "open" ? () => void props.account.lock() : undefined}
      onUse={() => props.account.touch()}
    >
      <Switch>
        <Match when={props.account.phase() === "connect"}>
          <ConnectScreen onConnect={props.account.connect} />
        </Match>
        <Match when={props.account.phase() === "locked" && props.account.device()}>
          {(device) => (
            <LockedScreen
              server={device().server}
              onUnlock={props.account.unlock}
              onOther={() => void props.account.forget()}
            />
          )}
        </Match>
        <Match when={props.account.phase() === "open"}>
          <VaultScreen account={props.account} host={host} toasts={toasts} />
        </Match>
      </Switch>
      <Show when={props.account.phase() === "starting"}>
        <main class="flex-1" />
      </Show>
    </Shell>
  );
};
