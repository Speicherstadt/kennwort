/**
 * Settings → Entsperren mit Passkey (K-707, P-03): set up a passkey that unlocks this account, see
 * the passkeys the account state names and remove one. The list comes from the account state,
 * sealed under AK, never from the server.
 */
import type { PasskeyError } from "@kennwort/client/session/passkey-unlock.ts";
import type { UnlockPasskeys } from "@kennwort/core";
import { Button, m, panelClass, panelTitleClass } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import type { PasskeyUnlock } from "../session/passkey.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export const passkeyErrorText = (error: PasskeyError): string =>
  ({
    "no-prf": m.error_passkey_no_prf(),
    cancelled: m.error_passkey_cancelled(),
    "wrong-passkey": m.error_passkey_wrong(),
    "passkey-removed": m.error_passkey_removed(),
    unreachable: m.error_unreachable(),
    unexpected: m.error_unexpected(),
  })[error];

const formatDate = (time: number) =>
  new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: "medium",
  }).format(time);

/** The passkeys that may unlock, the newest first */
export const activePasskeys = (passkeys: UnlockPasskeys) =>
  Object.entries(passkeys)
    .filter(([, passkey]) => !passkey.removed)
    .map(([id, passkey]) => ({ id, at: passkey.at }))
    .sort((a, b) => b.at - a.at);

export const PasskeySection = (props: { passkeys: UnlockPasskeys; unlock: PasskeyUnlock }) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [done, setDone] = createSignal(false);
  const run = async (step: () => Promise<{ ok: true } | { ok: false; error: PasskeyError }>) => {
    setBusy(true);
    setError(undefined);
    setDone(false);
    const result = await step();
    setBusy(false);
    if (!result.ok) setError(passkeyErrorText(result.error));
    return result.ok;
  };
  return (
    <section aria-labelledby="passkeys-title" class={panelClass}>
      <h2 id="passkeys-title" class={panelTitleClass}>
        {m.passkey_title()}
      </h2>
      <p class="text-xs text-muted-foreground">{m.passkey_text()}</p>
      <Show when={activePasskeys(props.passkeys).length > 0}>
        <ul class="divide-y divide-border rounded-xl border border-border" data-testid="passkeys">
          <For each={activePasskeys(props.passkeys)}>
            {(passkey) => (
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">
                    {m.passkey_name()}
                    <Show when={props.unlock.thisDevice() === passkey.id}>
                      <span class="ml-2 text-xs font-normal text-muted-foreground">
                        {m.devices_this_device()}
                      </span>
                    </Show>
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {m.passkey_added({ date: formatDate(passkey.at) })}
                  </p>
                </div>
                <Button
                  size="sm"
                  class="h-11 md:h-7"
                  disabled={busy()}
                  onClick={() => run(() => props.unlock.remove(passkey.id))}
                >
                  {m.passkey_remove()}
                </Button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Button
        class="w-fit"
        disabled={busy()}
        onClick={async () => setDone(await run(() => props.unlock.setUp()))}
      >
        {busy() ? m.working() : m.passkey_set_up()}
      </Button>
      <Show when={done()}>
        <p role="status" class="text-[13px]">
          {m.passkey_set_up_done()}
        </p>
      </Show>
      <Show when={error()}>
        {(text) => (
          <p role="alert" class={alertClass}>
            {text()}
          </p>
        )}
      </Show>
    </section>
  );
};
