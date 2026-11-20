/**
 * What the app shows: setting up a company and accepting an invitation are always reachable; the
 * rest only with an unlocked account, else the unlock screen, or the welcome on a new device (K-303)
 */
import { createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { InvitePage } from "./account/invite-page.tsx";
import { SetupPage } from "./account/setup-page.tsx";
import { UnlockPage, WelcomePage } from "./account/unlock-page.tsx";
import { Frame } from "./frame/frame.tsx";
import type { Navigation } from "./navigation.ts";
import type { Session } from "./session/session.ts";

export const App = (props: { nav: Navigation; session: Session; hash?: string }) => {
  const [otherAccount, setOtherAccount] = createSignal(false);
  const route = () => props.nav.route();
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
    <Switch>
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
          <UnlockPage session={props.session} />
        </Show>
      </Match>
      <Match when={props.session.opened()}>
        <Frame nav={props.nav} onLock={() => props.session.lock()} />
      </Match>
    </Switch>
  );
};
