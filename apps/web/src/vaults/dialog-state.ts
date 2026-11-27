/**
 * What the members dialog of a vault keeps while it is open (K-305): the open requests, the
 * company's groups and the vault's links, reloaded after every change, and whether a change runs
 */

import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import type { Vault, VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import type { MemberView } from "@kennwort/core";
import { createEffect, createSignal } from "solid-js";
import { type Group, type Link, loadGroups, loadLinks } from "../groups/groups.ts";
import type { Session } from "../session/session.ts";
import type { ExitError } from "./exit.ts";
import { loadRequests, type Request } from "./vault-members.ts";
import type { VaultStore } from "./vault-store.ts";

export type DialogApi = VaultDeps & GroupApi;
/** A change to the log; removing someone also rotates the key, which can fail in more ways */
export type Outcome = { ok: true } | { ok: false; error: ExitError };

export const createDialogState = (props: {
  vault: Vault;
  people: MemberView[];
  api: DialogApi;
  session: Session;
  store: VaultStore;
}) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<ExitError>();
  const [requests, setRequests] = createSignal<Request[]>([]);
  const [groups, setGroups] = createSignal<Group[]>([]);
  const [links, setLinks] = createSignal<Link[]>([]);
  const { api, session } = props;
  const reloadAround = async () => {
    const [r, g, l] = await Promise.all([
      loadRequests(api, session, props.vault, props.people),
      loadGroups(api, session),
      loadLinks(api, session, props.vault),
    ]);
    setRequests(r ?? []);
    setGroups(g ?? []);
    setLinks(l ?? []);
  };
  // Reload whenever the panel opens or switches to another vault
  createEffect(
    () => props.vault.idText,
    () => {
      setError(undefined);
      void reloadAround();
    },
  );
  /** A change to the log, then the vault and what is around it anew */
  const run = async (change: () => Promise<Outcome>) => {
    setBusy(true);
    setError(await props.store.change(change));
    await reloadAround();
    setBusy(false);
  };
  return { busy, error, requests, groups, links, run };
};
