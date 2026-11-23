/**
 * Push on this device and which kinds go out as push (K-602): the browser asks for its permission
 * only after the click on „Push-Mitteilungen einschalten“, never on its own. The kinds are the
 * account's, stored on the server; in the app every kind always shows.
 */
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPrefs } from "@kennwort/core";
import { Button, m, panelClass, panelTitleClass } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Loading, onSettled, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import { kindLabels } from "./notification-text.ts";
import { type NotificationsDeps, prefsQuery, tokenOf } from "./notifications-query.ts";
import {
  browserPush,
  disablePush,
  enablePush,
  type PushDeps,
  type PushOutcome,
  pushState,
} from "./push.ts";

const stateText: Record<Exclude<PushOutcome, "off">, () => string> = {
  on: () => m.push_on(),
  denied: () => m.push_denied(),
  unsupported: () => m.push_unsupported(),
  failed: () => m.push_failed(),
};

const toggled = (prefs: NotificationPrefs, kind: NotificationKind, on: boolean) => ({
  push: on ? [...prefs.push, kind] : prefs.push.filter((k) => k !== kind),
});

const KindChoice = (props: { deps: NotificationsDeps }) => {
  const client = useQueryClient();
  const prefs = useQuery(prefsQuery(props.deps));
  const [failed, setFailed] = createSignal(false);
  const save = async (next: NotificationPrefs) => {
    const saved = await props.deps.api.setNotificationPrefs(tokenOf(props.deps.session), next);
    setFailed(!saved);
    await client.invalidateQueries({ queryKey: queryKeys.notificationPrefs });
  };
  return (
    <Loading>
      <Show when={prefs.data}>
        {(loaded) => (
          <fieldset class="grid gap-1.5">
            <legend class="mb-1 text-xs font-medium">{m.push_kinds()}</legend>
            <For each={NOTIFICATION_KINDS}>
              {(kind) => (
                <label class="flex min-h-11 items-center gap-2 text-[13px] md:min-h-0">
                  <input
                    type="checkbox"
                    checked={loaded().push.includes(kind)}
                    onChange={(event) =>
                      void save(toggled(loaded(), kind, event.currentTarget.checked))
                    }
                  />
                  {kindLabels[kind]()}
                </label>
              )}
            </For>
          </fieldset>
        )}
      </Show>
      <Show when={failed()}>
        <p role="alert" class="text-[13px] text-danger">
          {m.push_kinds_failed()}
        </p>
      </Show>
    </Loading>
  );
};

export const PushSettings = (props: { deps: NotificationsDeps; browser?: PushDeps }) => {
  const push = (): PushDeps =>
    props.browser ?? {
      ...browserPush(),
      api: props.deps.api,
      token: () => tokenOf(props.deps.session),
    };
  const [state, setState] = createSignal<PushOutcome>();
  const [busy, setBusy] = createSignal(false);
  onSettled(() => {
    void pushState(push()).then(setState);
  });
  const run = async (step: (deps: PushDeps) => Promise<PushOutcome>) => {
    setBusy(true);
    setState(await step(push()));
    setBusy(false);
  };
  return (
    <section aria-labelledby="push-title" class={panelClass}>
      <h2 id="push-title" class={panelTitleClass}>
        {m.push_settings_title()}
      </h2>
      <p class="text-[13px] text-muted-foreground">{m.push_settings_text()}</p>
      <Show when={state()}>
        {(shown) => (
          <>
            <Show when={shown() !== "off"}>
              <p role="status" class="text-[13px]">
                {stateText[shown() as Exclude<PushOutcome, "off">]()}
              </p>
            </Show>
            <Show when={shown() === "off" || shown() === "failed"}>
              <Button
                class="h-11 justify-self-start md:h-8"
                disabled={busy()}
                onClick={() => void run(enablePush)}
              >
                {m.push_enable()}
              </Button>
            </Show>
            <Show when={shown() === "on"}>
              <Button
                class="h-11 justify-self-start md:h-8"
                disabled={busy()}
                onClick={() => void run(disablePush)}
              >
                {m.push_disable()}
              </Button>
            </Show>
          </>
        )}
      </Show>
      <KindChoice deps={props.deps} />
    </section>
  );
};
