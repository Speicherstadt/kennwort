/**
 * Konto → Schlüssel erneuern (K-307 part e, P-12): what renewing does, the passphrase once more,
 * then the new recovery kit and the code an owner or admin compares to confirm the new keys.
 */
import type { Loaded } from "@kennwort/client/vaults/vaults.ts";
import type { Derive } from "@kennwort/core";
import { Badge, Button, Icon, Input, m } from "@kennwort/ui";
import { ShieldCheck } from "@kennwort/ui/icons";
import { createSignal, For, Show } from "solid-js";
import type { Navigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import { errorText } from "./form.tsx";
import { KitContent } from "./kit.tsx";
import { type RenewDeps, type RenewDone, type RenewError, renewAccount } from "./renew.ts";

const renewErrorText = (error: RenewError) =>
  ({
    "wrong-passphrase": errorText("wrong-passphrase"),
    unreachable: m.renew_unreachable(),
    damaged: m.renew_damaged(),
    refused: m.renew_refused(),
    conflict: m.renew_conflict(),
    locked: m.error_unexpected(),
  })[error];

const steps = () => [
  m.renew_step_keys(),
  m.renew_step_confirm(),
  m.renew_step_vaults(),
  m.renew_step_devices(),
  m.renew_step_shares(),
];

const sectionClass = "grid gap-3 rounded-xl border border-border p-4";

/** The new bundle's code in its 12 groups, and whether it is confirmed already */
const CodeCard = (props: { done: RenewDone }) => (
  <section aria-labelledby="renew-code" class={sectionClass}>
    <h2 id="renew-code" class="font-semibold">
      {m.renew_code_title()}
    </h2>
    <Show
      when={props.done.certified}
      fallback={<p class="text-[13px] text-muted-foreground">{m.renew_code_text()}</p>}
    >
      <Badge tone="success" class="w-fit">
        <Icon icon={ShieldCheck} /> {m.renew_certified()}
      </Badge>
    </Show>
    <p
      class="rounded-lg bg-muted px-3 py-2 font-mono text-[15px] tracking-wide"
      data-testid="renew-code"
    >
      {props.done.code}
    </p>
  </section>
);

export const RenewPage = (props: {
  nav: Navigation;
  session: Session;
  api: RenewDeps;
  /** The vaults as last loaded: their keys go along, wrapped to the new keys */
  loaded: () => Loaded | undefined;
  /** After the renewal: the vaults load anew and catch up (vaults/renewals.ts) */
  onRenewed: () => Promise<void>;
  /** Argon2id as F-05 fixes it; only tests pass a lighter one */
  derive?: Derive;
}) => {
  const [passphrase, setPassphrase] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal<RenewDone>();
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const renewed = await renewAccount(
      props.api,
      props.session,
      props.loaded(),
      passphrase(),
      props.derive,
    );
    setBusy(false);
    if (!renewed.ok) return setError(renewErrorText(renewed.error));
    setPassphrase("");
    setDone(renewed.value);
    await props.onRenewed();
  };
  return (
    <section aria-labelledby="page-title" class="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
        {m.renew_title()}
      </h1>
      <div class="grid max-w-xl gap-6">
        <Show
          when={done()}
          fallback={
            <>
              <p class="text-muted-foreground">{m.renew_intro()}</p>
              <ul class="grid list-disc gap-1.5 pl-5 text-[13px]">
                <For each={steps()}>{(step) => <li>{step}</li>}</For>
              </ul>
              <Show when={error()}>
                <p
                  role="alert"
                  class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
                >
                  {error()}
                </p>
              </Show>
              <form class="grid gap-4" onSubmit={submit}>
                <p class="text-[13px] text-muted-foreground">{m.renew_passphrase_hint()}</p>
                <Input
                  label={m.passphrase()}
                  type="password"
                  autocomplete="current-password"
                  value={passphrase()}
                  onInput={(event) => setPassphrase(event.currentTarget.value)}
                />
                <Button type="submit" variant="primary" class="w-fit" disabled={busy()}>
                  {busy() ? m.working() : m.renew_submit()}
                </Button>
              </form>
            </>
          }
        >
          {(made) => (
            <>
              <CodeCard done={made()} />
              <section aria-labelledby="renew-kit" class={sectionClass}>
                <h2 id="renew-kit" class="font-semibold">
                  {m.kit_title()}
                </h2>
                <KitContent keys={made().keys} onDone={() => props.nav.go("/settings")} />
              </section>
            </>
          )}
        </Show>
      </div>
    </section>
  );
};
