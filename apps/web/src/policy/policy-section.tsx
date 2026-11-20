/**
 * The company policy on the members page (K-304): everyone sees the lock time the company set;
 * owners change it. The value shown is the one the client checked under the pinned root.
 */
import { LOCK_MINUTES, type UnsignedPolicy } from "@kennwort/core";
import { Button, Input, m } from "@kennwort/ui";
import { createSignal, onSettled, Show } from "solid-js";
import type { Session } from "../session/session.ts";
import { applyPolicy, loadPolicy, type PolicyDeps, saveLockTime } from "./policy.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export const PolicySection = (props: { session: Session; api: PolicyDeps; canEdit: boolean }) => {
  const [policy, setPolicy] = createSignal<UnsignedPolicy>();
  const [problem, setProblem] = createSignal<string>();
  const [minutes, setMinutes] = createSignal("");
  const [status, setStatus] = createSignal<"saved" | "failed">();
  const [busy, setBusy] = createSignal(false);
  const refresh = async () => {
    const opened = props.session.opened();
    if (!opened) return;
    const loaded = await loadPolicy(props.api, opened);
    setProblem(
      loaded.ok
        ? undefined
        : loaded.error === "unreachable"
          ? m.policy_unreachable()
          : m.policy_invalid(),
    );
    if (!loaded.ok) return;
    setPolicy(loaded.value);
    setMinutes(String(loaded.value.lockAfterMinutes));
  };
  // Once on screen, then after each save; the section lives only while the account is open
  onSettled(() => void refresh());
  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    const value = Number(minutes());
    if (!Number.isInteger(value) || value < LOCK_MINUTES.min || value > LOCK_MINUTES.max) return;
    setBusy(true);
    const saved = await saveLockTime(props.api, props.session, value);
    setBusy(false);
    setStatus(saved ? "saved" : "failed");
    await refresh();
  };
  return (
    <section aria-labelledby="policy-title" class="grid gap-3">
      <h2 id="policy-title" class="text-xs font-medium">
        {m.policy_title()}
      </h2>
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
