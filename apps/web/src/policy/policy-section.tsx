/**
 * The company policy on the members page (K-304): everyone sees the lock time the company set;
 * owners change it. The value shown is the one the client checked under the pinned root.
 */
import { LOCK_MINUTES, type UnsignedPolicy } from "@kennwort/core";
import { Button, Input, m } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, Loading, onSettled, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";
import { applyPolicy, loadPolicy, type PolicyDeps, saveLockTime } from "./policy.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export const PolicySection = (props: { session: Session; api: PolicyDeps; canEdit: boolean }) => {
  const client = useQueryClient();
  // Checked under the pinned root, errors as values; null while the account is locked
  const loaded = useQuery(() => {
    const opened = props.session.opened();
    return {
      queryKey: queryKeys.policy,
      queryFn: async () => (opened ? loadPolicy(props.api, opened) : null),
    };
  });
  // A load that fails keeps the last valid policy on screen, next to the problem
  const policy = createMemo<UnsignedPolicy | undefined>((last) => {
    const value = loaded.data;
    return value?.ok ? value.value : last;
  });
  const problem = () => {
    const value = loaded.data;
    if (!value || value.ok) return undefined;
    return value.error === "unreachable" ? m.policy_unreachable() : m.policy_invalid();
  };
  // What the owner types, set back to the policy in force whenever it loads
  const [minutes, setMinutes] = createSignal(() => String(policy()?.lockAfterMinutes ?? ""));
  const [status, setStatus] = createSignal<"saved" | "failed">();
  const [busy, setBusy] = createSignal(false);
  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    const value = Number(minutes());
    if (!Number.isInteger(value) || value < LOCK_MINUTES.min || value > LOCK_MINUTES.max) return;
    setBusy(true);
    const saved = await saveLockTime(props.api, props.session, value);
    setBusy(false);
    setStatus(saved ? "saved" : "failed");
    await client.invalidateQueries({ queryKey: queryKeys.policy });
  };
  return (
    <section aria-labelledby="policy-title" class="grid gap-3">
      <h2 id="policy-title" class="text-xs font-medium">
        {m.policy_title()}
      </h2>
      <Loading>
        <Show when={problem()}>
          <p role="alert" class={alertClass}>
            {problem()}
          </p>
        </Show>
        <Show when={policy()}>
          {(current) => (
            <Show
              when={props.canEdit}
              fallback={<p>{m.policy_lock_after({ minutes: current().lockAfterMinutes })}</p>}
            >
              <form class="flex flex-wrap items-end gap-2" onSubmit={save}>
                <div class="w-40">
                  <Input
                    label={m.policy_lock_label()}
                    type="number"
                    min={LOCK_MINUTES.min}
                    max={LOCK_MINUTES.max}
                    value={minutes()}
                    required
                    onInput={(event) => setMinutes(event.currentTarget.value)}
                  />
                </div>
                <Button type="submit" class="h-11 md:h-8" disabled={busy()}>
                  {busy() ? m.working() : m.policy_save()}
                </Button>
              </form>
            </Show>
          )}
        </Show>
      </Loading>
      <Show when={status() === "saved"}>
        <p role="status" class="text-[13px] text-success">
          {m.policy_saved()}
        </p>
      </Show>
      <Show when={status() === "failed"}>
        <p role="alert" class={alertClass}>
          {m.policy_failed()}
        </p>
      </Show>
    </section>
  );
};

/** Applies the company policy once the account is open (the lock time); renders nothing */
export const ApplyPolicy = (props: { session: Session; api: PolicyDeps }) => {
  onSettled(() => void applyPolicy(props.api, props.session));
  return null;
};
