/**
 * The two halves of a handover (K-605, handover.ts): in the own company the vault and the
 * customer's company are chosen, in the customer's company the person who takes it over and the
 * role the installer keeps. In between the device switches companies; the contents stay in memory.
 */
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, MemberView } from "@kennwort/core";
import { Button, Dialog, m } from "@kennwort/ui";
import { createSignal, For, Show } from "solid-js";
import { customers, type HandoverStep } from "./handover.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const stepText = (step: HandoverStep) =>
  ({
    create: m.handover_failed_create(),
    entries: m.handover_failed_entries(),
    customer: m.handover_failed_customer(),
    role: m.handover_failed_role(),
  })[step];

/** In the own company: which company of the account takes the vault */
export const HandoverStart = (props: {
  vault: Vault;
  count: number;
  companies: { id: string; name: string }[];
  busy: boolean;
  onStart: (target: string) => void;
  onClose: () => void;
}) => {
  const [target, setTarget] = createSignal<string>();
  const name = () => props.vault.name ?? m.vaults_unnamed();
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={m.handover_title({ name: name() })}
      description={m.handover_intro()}
    >
      <div class="grid gap-3 p-4 pt-2">
        <fieldset class="grid gap-2">
          <legend class="mb-1 text-xs font-medium">{m.handover_target()}</legend>
          <For each={props.companies}>
            {(company) => (
              <label class="flex min-h-11 items-center gap-2 md:min-h-0">
                <input
                  type="radio"
                  name="handover-target"
                  value={company.id}
                  onChange={() => setTarget(company.id)}
                />
                {company.name}
              </label>
            )}
          </For>
        </fieldset>
        <p class="text-[13px]">{m.handover_count({ count: props.count })}</p>
        <p class="text-xs text-muted-foreground">{m.handover_stays()}</p>
        <Button
          variant="primary"
          class="w-fit"
          disabled={!target() || props.busy}
          onClick={() => {
            const chosen = target();
            if (chosen) props.onStart(chosen);
          }}
        >
          {props.busy ? m.companies_switching() : m.handover_next()}
        </Button>
      </div>
    </Dialog>
  );
};

/** In the customer's company: who takes the vault over, and what the installer keeps */
export const HandoverFinish = (props: {
  vaultName: string;
  count: number;
  people: MemberView[] | undefined;
  me: Uint8Array;
  onHandOver: (customer: Certificate) => Promise<HandoverStep | undefined>;
  onCancel: () => void;
}) => {
  const [customer, setCustomer] = createSignal<Certificate>();
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal<HandoverStep>();
  const chosen = () => customers(props.people ?? [], props.me);
  const submit = async () => {
    const taker = customer();
    if (!taker) return;
    setBusy(true);
    setFailed(await props.onHandOver(taker));
    setBusy(false);
  };
  return (
    <Dialog
      open
      onClose={props.onCancel}
      title={m.handover_finish_title({ name: props.vaultName })}
      description={m.handover_finish_intro({ count: props.count })}
    >
      <div class="grid gap-3 p-4 pt-2">
        <Show
          when={chosen().length > 0}
          fallback={
            <p class="text-[13px] text-muted-foreground">
              {props.people ? m.handover_no_customer() : m.vaults_loading()}
            </p>
          }
        >
          <fieldset class="grid gap-2">
            <legend class="mb-1 text-xs font-medium">{m.handover_customer()}</legend>
            <For each={chosen()}>
              {(person) => (
                <label class="flex min-h-11 items-center gap-2 md:min-h-0">
                  <input
                    type="radio"
                    name="handover-customer"
                    onChange={() => setCustomer(person.certificate)}
                  />
                  {person.name ?? m.members_unnamed()}
                </label>
              )}
            </For>
          </fieldset>
          <p class="text-[13px]">{m.handover_keep()}</p>
          <p class="text-xs text-muted-foreground">{m.handover_customer_decides()}</p>
        </Show>
        <Show when={failed()}>
          {(step) => (
            <p role="alert" class={alertClass}>
              {stepText(step())}
            </p>
          )}
        </Show>
        <div class="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!customer() || busy()} onClick={() => void submit()}>
            {busy() ? m.working() : m.handover_submit()}
          </Button>
          <Button disabled={busy()} onClick={() => props.onCancel()}>
            {m.handover_cancel()}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
