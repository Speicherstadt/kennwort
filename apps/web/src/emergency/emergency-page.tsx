/**
 * Konto → Notfallzugriff (K-307 part d, P-14): name a trusted colleague with a waiting time, see
 * and answer their request (object or approve early), revoke; and for grants this account holds,
 * ask for access and, once the packages are out and pass every check, read the grantor's entries.
 * Like Bitwarden's Emergency Access; the client checks each key against what the grantor signed.
 */
import {
  approveEarly,
  type EmergencyDeps,
  grantAccess,
  objectTo,
  type Received,
  requestAccess,
  revoke,
} from "@kennwort/client/emergency/emergency.ts";
import { type OpenedVault, openReleased } from "@kennwort/client/emergency/open.ts";
import type { RecoveryApi } from "@kennwort/client/session/recovery-api.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes } from "@kennwort/core";
import { m, pageClass, type Toasts } from "@kennwort/ui";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Loading, Show } from "solid-js";
import { queryKeys } from "../queries.ts";
import type { Opened, Session } from "../session/session.ts";
import { emergencyQuery } from "./emergency.ts";
import { type GiveChoice, GiveForm } from "./give-form.tsx";
import { GivenList, ReceivedList } from "./grant-lists.tsx";

export type EmergencyPageApi = EmergencyDeps & RecoveryApi;

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";
const seconds = () => Math.floor(Date.now() / 1000);
const keyOf = (received: Received) => encodeBytes(received.grant.grantor);

export const EmergencyPage = (props: {
  api: EmergencyPageApi;
  session: Session;
  vaults: () => readonly Vault[] | undefined;
  /** The frame's toasts, for copying a field of an opened entry */
  toasts: Toasts;
}) => {
  const client = useQueryClient();
  // null for a list that did not load or did not check: a query holds a value, never undefined
  const overview = useQuery(emergencyQuery(props.api, props.session));
  const [problem, setProblem] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [opened, setOpened] = createSignal<Record<string, readonly OpenedVault[]>>({});
  /** Runs a step with the open account, then loads the lists anew; a text says what went wrong */
  const run = async (step: (account: Opened) => Promise<boolean | string>) => {
    const account = props.session.opened();
    if (!account) return;
    setBusy(true);
    const done = await step(account);
    await client.invalidateQueries({ queryKey: queryKeys.emergency });
    setProblem(done === true ? undefined : done || m.emergency_failed());
    setBusy(false);
  };
  const give = (choice: GiveChoice) =>
    run(async (account) => {
      const trust = overview.data?.trust;
      if (!trust) return false;
      return (
        (await grantAccess(props.api, account, trust, choice.granteeId, choice.terms)) === "ok"
      );
    });
  const open = (received: Received) =>
    run(async (account) => {
      const checked = overview.data;
      if (!checked) return false;
      const result = await openReleased(props.api, account, { ...checked, received });
      if (!result.ok)
        return result.error === "waiting" ? m.emergency_waiting() : m.emergency_refused();
      setOpened((now) => ({ ...now, [keyOf(received)]: result.value }));
      return true;
    });
  const colleagues = () => {
    const shown = overview.data;
    const me = shown ? encodeBytes(shown.me.accountId) : "";
    return (shown?.people ?? []).filter(
      (p) => p.status === "certified" && p.leftAt == null && encodeBytes(p.accountId) !== me,
    );
  };
  return (
    <section aria-labelledby="page-title" class={pageClass()}>
      <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
        {m.emergency_title()}
      </h1>
      <p class="mb-4 max-w-prose text-muted-foreground">{m.emergency_intro()}</p>
      <Loading>
        <Show when={problem() ?? (overview.data === null ? m.emergency_load_failed() : undefined)}>
          {(text) => (
            <p class={`${alertClass} mb-4`} role="alert">
              {text()}
            </p>
          )}
        </Show>
        <Show when={overview.data}>
          {(shown) => (
            <div class="grid max-w-2xl gap-6">
              <ReceivedList
                received={shown().received}
                now={seconds()}
                busy={busy()}
                opened={(key) => opened()[key]}
                keyOf={keyOf}
                toasts={props.toasts}
                onRequest={(r) => run((a) => requestAccess(props.api, a, r.grant))}
                onOpen={open}
              />
              <GivenList
                given={shown().given}
                now={seconds()}
                busy={busy()}
                onObject={(g) => run((a) => objectTo(props.api, a, g))}
                onApprove={(g) => run((a) => approveEarly(props.api, a, g))}
                onRevoke={(g) => run((a) => revoke(props.api, a, g.grant))}
              />
              <GiveForm
                people={colleagues()}
                vaults={props.vaults() ?? []}
                busy={busy()}
                onGive={give}
              />
            </div>
          )}
        </Show>
      </Loading>
    </section>
  );
};
