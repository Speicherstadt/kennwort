/**
 * Push on this device and which kinds go out as push (K-602): the browser asks for its permission
 * only after the click on „Push-Mitteilungen einschalten“, never on its own. The kinds are the
 * account's, stored on the server; in the app every kind always shows.
 */
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPrefs } from "@kennwort/core";
import { Button, m, panelClass, panelTitleClass, Switch } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, createUniqueId, For, Loading, onSettled, Show } from "solid-js";
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
import { groupTitles, kindDescriptions, kindsIn, PUSH_GROUPS } from "./push-groups.ts";

const stateText: Record<Exclude<PushOutcome, "off">, () => string> = {
  on: () => m.push_on(),
  denied: () => m.push_denied(),
  unsupported: () => m.push_unsupported(),
  failed: () => m.push_failed(),
};

const toggled = (prefs: NotificationPrefs, kind: NotificationKind, on: boolean) => ({
  push: on ? [...prefs.push, kind] : prefs.push.filter((k) => k !== kind),
});

/** One kind: name and description on the left, its switch on the right */
const KindRow = (props: {
  kind: NotificationKind;
  on: boolean;
  onChange: (on: boolean) => void;
}) => {
  const id = createUniqueId();
  return (
    <li class="flex min-h-14 items-center justify-between gap-4 px-3 py-2.5">
      <div class="grid gap-0.5">
        <label for={id} class="cursor-pointer text-[13px] font-medium">
          {kindLabels[props.kind]()}
        </label>
        <p id={`${id}-desc`} class="text-xs text-muted-foreground">
          {kindDescriptions[props.kind]()}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-desc`}
        checked={props.on}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
    </li>
  );
};

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
          <fieldset class="grid gap-4">
            <legend class="mb-2 text-xs font-medium">{m.push_kinds()}</legend>
            <For each={PUSH_GROUPS}>
              {(group) => (
                <div class="grid gap-1.5">
                  <h3 class="text-[11px] font-medium tracking-[.04em] text-muted-foreground uppercase">
                    {groupTitles[group]()}
                  </h3>
                  <ul class="divide-y divide-border border-t border-border">
                    <For each={kindsIn(NOTIFICATION_KINDS, group)}>
                      {(kind) => (
                        <KindRow
                          kind={kind}
                          on={loaded().push.includes(kind)}
                          onChange={(on) => void save(toggled(loaded(), kind, on))}
                        />
                      )}
                    </For>
                  </ul>
                </div>
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
      <Show when={state() === "unsupported"} fallback={<KindChoice deps={props.deps} />}>
        <details class="grid gap-3 border-t border-border pt-3">
          <summary class="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {m.push_kinds()}
          </summary>
          <KindChoice deps={props.deps} />
        </details>
      </Show>
    </section>
  );
};
