/**
 * What the app shows: setting up a company and accepting an invitation are always reachable; the
 * rest only with an unlocked account, else the unlock screen, or the welcome on a new device (K-303).
 * Another language renders everything anew instead of reloading the page, which would lock it.
 */
import { getLocale, type Locale, setLocale } from "@kennwort/ui";
import { createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { AddDevicePage } from "./account/add-device-page.tsx";
import { InvitePage } from "./account/invite-page.tsx";
import { type PairDeps, PairPage } from "./account/pair-page.tsx";
import { RecoverPage } from "./account/recover-page.tsx";
import { SetupPage } from "./account/setup-page.tsx";
import { readDeviceLink, UnlockPage, WelcomePage } from "./account/unlock-page.tsx";
import { DevicesSection } from "./frame/devices-section.tsx";
import { Frame } from "./frame/frame.tsx";
import type { MembersDeps } from "./members/members.ts";
import { MembersPage } from "./members/members-page.tsx";
import type { Navigation } from "./navigation.ts";
import { ApplyPolicy } from "./policy/policy-section.tsx";
import type { DevicesApi } from "./session/devices-api.ts";
import type { Session } from "./session/session.ts";

export type AppApi = PairDeps & DevicesApi & MembersDeps;

export const App = (props: { nav: Navigation; session: Session; api: AppApi; hash?: string }) => {
  const [otherAccount, setOtherAccount] = createSignal(false);
  const [locale, setShownLocale] = createSignal(getLocale());
  const changeLocale = (next: Locale) => {
    setLocale(next, { reload: false });
    document.documentElement.lang = next;
    setShownLocale(next);
  };
  const route = () => props.nav.route();
  // The kit's link carries the Secret Key in its fragment: read it once, then drop it from the
  // address and the history entry at once, whether or not unlocking follows (P-12)
  const deviceLink =
    route().page === "unlock" ? readDeviceLink(props.hash ?? location.hash) : undefined;
  if (deviceLink) props.nav.dropFragment();
  // The pairing link carries the pairing secret: read once, dropped at once too (P-04)
  const pairingText = route().page === "link" ? (props.hash ?? location.hash) : "";
  if (pairingText) props.nav.dropFragment();
  // Every key press or click pushes the automatic lock back (P-03)
  const touch = () => props.session.touch();
  document.addEventListener("pointerdown", touch);
  document.addEventListener("keydown", touch);
  onCleanup(() => {
    document.removeEventListener("pointerdown", touch);
    document.removeEventListener("keydown", touch);
  });
  const invite = () => {
    const r = route();
    return r.page === "invite" ? r : undefined;
  };
  return (
    <Show when={locale()} keyed>
      {(_locale) => (
        <Switch>
          <Match when={route().page === "unlock"}>
            <UnlockPage
              nav={props.nav}
              session={props.session}
              link={deviceLink}
              onUnlocked={() => props.nav.replace("/entries")}
            />
          </Match>
          <Match when={route().page === "recover"}>
            <RecoverPage nav={props.nav} session={props.session} />
          </Match>
          <Match when={route().page === "pair"}>
            <PairPage nav={props.nav} session={props.session} api={props.api} />
          </Match>
          <Match when={route().page === "link" && props.session.opened()}>
            <AddDevicePage
              nav={props.nav}
              session={props.session}
              api={props.api}
              link={pairingText || undefined}
            />
          </Match>
          <Match when={route().page === "setup"}>
            <SetupPage nav={props.nav} session={props.session} />
          </Match>
          <Match when={invite()}>
            {(r) => (
              <InvitePage
                nav={props.nav}
                session={props.session}
                id={r().id}
                hash={props.hash ?? location.hash}
              />
            )}
          </Match>
          <Match when={!props.session.opened()}>
            <Show
              when={props.session.device() || otherAccount()}
              fallback={<WelcomePage nav={props.nav} onUnlock={() => setOtherAccount(true)} />}
            >
              <UnlockPage nav={props.nav} session={props.session} />
            </Show>
          </Match>
          <Match when={props.session.opened()}>
            <ApplyPolicy session={props.session} api={props.api} />
            <Frame
              nav={props.nav}
              onLock={() => props.session.lock()}
              onLocale={changeLocale}
              onAddDevice={() => props.nav.go("/link")}
              members={() => (
                <MembersPage session={props.session} api={props.api} origin={location.origin} />
              )}
              devices={() => (
                <Show when={props.session.opened()?.token}>
                  {(token) => (
                    <DevicesSection
                      token={token()}
                      api={props.api}
                      onSignedOut={() => {
                        props.session.forget();
                        props.nav.replace("/entries");
                      }}
                    />
                  )}
                </Show>
              )}
            />
          </Match>
        </Switch>
      )}
    </Show>
  );
};
