/**
 * Reducing an editor or manager to reading (P-09, P-06): a record counts only while its author may
 * edit now, so the manager's client first writes every entry whose newest version that person
 * wrote again under its own signature, then signs the role entry, then writes anew what the
 * person got onto the server in between, from the versions that still count. If the device goes
 * offline after the role entry, the catch-up after the next unlock does that last step (exit.ts),
 * as it does a rotation that did not write everything.
 */
import type { ResaveDone } from "@kennwort/client/entries/entry-resave.ts";
import type { Loaded, Vault, VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import { idKey, type VaultRole } from "@kennwort/core";
import type { Session } from "../session/session.ts";
import type { ExitError } from "./exit.ts";
import { changeVaultRole } from "./vault-members.ts";

export type DemoteStores = {
  reload: () => Promise<Loaded | undefined>;
  resave: (vaultIdText: string, accountId: Uint8Array) => Promise<ResaveDone>;
  restore: (vaultIdText: string) => Promise<ResaveDone>;
};

type Done = { ok: true } | { ok: false; error: ExitError };

const mayEdit = (role: VaultRole | undefined) => role === "edit" || role === "manage";

/** Another role for a member; down to reading, with the re-save around the role entry */
export const changeRole = async (
  deps: { api: VaultDeps; session: Session },
  stores: DemoteStores,
  vault: Vault,
  accountId: Uint8Array,
  role: VaultRole,
): Promise<Done> => {
  const before = vault.log.members.get(idKey(accountId))?.role;
  if (role !== "read" || !mayEdit(before))
    return changeVaultRole(deps.api, deps.session, vault, accountId, role);
  // Nothing signed yet if this fails: the person keeps editing, and the manager may try again
  const saved = await stores.resave(vault.idText, accountId);
  if (!saved.ok) return saved;
  const changed = await changeVaultRole(deps.api, deps.session, vault, accountId, role);
  if (!changed.ok) return changed;
  if (!(await stores.reload())) return { ok: false, error: "unreachable" };
  return stores.restore(vault.idText);
};
