/**
 * What the vault access view keeps while it is open (K-305, K-608): the open requests of the
 * managed vaults, reloaded after every change, and whether a change is currently running.
 */

import type { Vault, VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import type { MemberView } from "@kennwort/core";
import { createEffect, createSignal } from "solid-js";
import type { Session } from "../session/session.ts";
import type { ExitError } from "./exit.ts";
import { loadRequests, mayManage, type Request } from "./vault-members.ts";
import type { VaultStore } from "./vault-store.ts";

export type DialogApi = VaultDeps;
/** A change to the log; removing someone also rotates the key, which can fail in more ways */
export type Outcome = { ok: true } | { ok: false; error: ExitError };

export const createVaultRequestsState = (props: {
  vaults: () => Vault[];
  people: () => MemberView[];
  api: DialogApi;
  session: Session;
  store: VaultStore;
}) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<ExitError>();
  const [byVault, setByVault] = createSignal<Record<string, Request[]>>({});
  const { api, session } = props;

  const reloadRequests = async () => {
    const managed = props.vaults().filter(mayManage);
    const people = props.people();
    const pairs = await Promise.all(
      managed.map(
        async (v) => [v.idText, (await loadRequests(api, session, v, people)) ?? []] as const,
      ),
    );
    setByVault(Object.fromEntries(pairs));
  };

  createEffect(
    () =>
      props
        .vaults()
        .map((v) => `${v.idText}:${v.entries.length}`)
        .join(","),
    () => {
      setError(undefined);
      void reloadRequests();
    },
  );

  /** Runs a change to the log, reloads the vaults and refreshes open requests */
  const run = async (change: () => Promise<Outcome>) => {
    setBusy(true);
    const failed = await props.store.change(change);
    setError(failed);
    await reloadRequests();
    setBusy(false);
    return failed;
  };

  return {
    busy,
    error,
    setError,
    requestsOf: (vaultId: string) => byVault()[vaultId] ?? [],
    run,
  };
};
