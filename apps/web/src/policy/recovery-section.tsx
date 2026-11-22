/**
 * Company recovery on the members page (K-307 part c, P-13): everyone sees whether it is on, as the
 * policy checked under the pinned root says, and whether this account's access is deposited, which
 * its own client checks and makes up for; owners switch it on or off and make a new key.
 */
import { loadPolicy } from "@kennwort/client/policy/policy.ts";
import {
  type DepositStatus,
  keepDeposit,
  makeRecoveryKey,
  type RecoveryDeps,
  switchRecoveryOff,
} from "@kennwort/client/policy/recovery.ts";
import { Button, m } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Loading, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

const depositText = (status: DepositStatus) => {
  if (status === "kept" || status === "deposited") return m.recovery_kept();
  if (status === "other-key") return m.recovery_other_key();
  return status === "off" ? undefined : m.recovery_unreachable();
};

export const RecoverySection = (props: {
  session: Session;
  api: RecoveryDeps;
  canEdit: boolean;
}) => {
  const client = useQueryClient();
  // The policy checked under the pinned root and the deposit kept up to it; null while locked
  const loaded = useQuery(() => {
    const opened = props.session.opened();
    return {
      queryKey: queryKeys.recovery,
      queryFn: async () => {
        if (!opened) return null;
        const policy = await loadPolicy(props.api, opened);
        const enabled = policy.ok && policy.value.companyRecovery.enabled;
        return { enabled, deposit: await keepDeposit(props.api, opened) };
      },
    };
  });
  const [status, setStatus] = createSignal<"saved" | "failed">();
  const [busy, setBusy] = createSignal(false);
  const change = async (work: () => Promise<boolean>) => {
    setBusy(true);
    const done = await work();
    setBusy(false);
    setStatus(done ? "saved" : "failed");
    await client.invalidateQueries({ queryKey: queryKeys.policy });
    await client.invalidateQueries({ queryKey: queryKeys.recovery });
  };
  return (
    <section aria-labelledby="recovery-title" class="grid gap-3">
      <h2 id="recovery-title" class="text-xs font-medium">
        {m.recovery_title()}
      </h2>
      <Loading>
        <Show when={loaded.data}>
          {(shown) => (
            <>
              <p class="text-[13px]">{shown().enabled ? m.recovery_on() : m.recovery_off()}</p>
              <Show when={depositText(shown().deposit)}>
                {(text) => (
                  <p
                    role={shown().deposit === "other-key" ? "alert" : "status"}
                    class={
                      shown().deposit === "other-key" ? alertClass : "text-[13px] text-success"
                    }
                  >
                    {text()}
                  </p>
                )}
              </Show>
              <Show when={props.canEdit}>
                <div class="flex flex-wrap gap-2">
                  <Show
                    when={shown().enabled}
                    fallback={
                      <Button
                        disabled={busy()}
                        onClick={() => change(() => makeRecoveryKey(props.api, props.session))}
                      >
                        {m.recovery_switch_on()}
                      </Button>
                    }
                  >
                    <Button
                      disabled={busy()}
                      title={m.recovery_new_key_hint()}
                      onClick={() => change(() => makeRecoveryKey(props.api, props.session))}
                    >
                      {m.recovery_new_key()}
                    </Button>
                    <Button
                      disabled={busy()}
                      onClick={() => change(() => switchRecoveryOff(props.api, props.session))}
                    >
                      {m.recovery_switch_off()}
                    </Button>
                  </Show>
                </div>
              </Show>
            </>
          )}
        </Show>
      </Loading>
      <Show when={status() === "saved"}>
        <p role="status" class="text-[13px] text-success">
          {m.recovery_saved()}
        </p>
      </Show>
      <Show when={status() === "failed"}>
        <p role="alert" class={alertClass}>
          {m.recovery_failed()}
        </p>
      </Show>
    </section>
  );
};
