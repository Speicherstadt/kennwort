// Leaving for the web tests (K-307 part b): Jonas keeps the Sparkasse login in Büro, where Anna
// edits; Max works at Weber Haustechnik outside Büro. Each reload loads the vaults and their entries
// anew, as the app's vault store does after a change.

import { loadVaults } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, encodeBytes } from "@kennwort/core";
import { type Colleague, sparkasseInBuero } from "../shares/shares.test-kit.ts";
import type { ExitDeps } from "./exit.ts";
import { addToVault } from "./vault-members.ts";

export const certificateOf = (who: Colleague): Certificate => {
  const certificate = who.row.certificate;
  if (!certificate) throw new Error("not certified");
  return certificate;
};

/** Büro with Jonas (manage) and Anna (edit), the Sparkasse login in it, loaded */
export const annaInBuero = async () => {
  const w = await sparkasseInBuero();
  const reload = async () => {
    const loaded = await loadVaults(w.api, w.c.session);
    if (!loaded.ok) throw new Error(loaded.error);
    await w.store.load(loaded.value.vaults, loaded.value.trust);
    return loaded.value;
  };
  const added = await addToVault(w.api, w.c.session, w.vault, certificateOf(w.anna), "edit");
  if (!added.ok) throw new Error(added.error);
  const loaded = await reload();
  const vaultOf = (l = loaded) => {
    const vault = l.vaults.find((v) => v.idText === w.vault.idText);
    if (!vault) throw new Error("no vault");
    return vault;
  };
  const deps: ExitDeps = { api: { ...w.api, ...w.shares.api }, session: w.c.session };
  const exits = {
    reload,
    rotate: w.store.rotate,
    behind: w.store.behind,
    resave: w.store.resave,
    restore: w.store.restore,
    restorable: w.store.restorable,
  };
  return { ...w, reload, loaded, vaultOf, deps, exits };
};

/** The records of Büro on the sync server: version and epoch of each */
export const recordsOf = async (w: Awaited<ReturnType<typeof annaInBuero>>) =>
  (await w.syncOf(w.vault.ring.vaultId).pull()).map((r) => [r.version, r.epoch]);

/** The accounts holding a key of Büro for an epoch, base64url */
export const keyHolders = (w: Awaited<ReturnType<typeof annaInBuero>>, epoch: number) =>
  [...(w.vaultServer.vaults.get(w.vault.idText)?.keys ?? new Map()).entries()]
    .filter(([, keys]) => keys.has(epoch))
    .map(([account]) => account)
    .sort();

/** Base64url account IDs, sorted, to compare with keyHolders */
export const accounts = (...ids: Uint8Array[]) => ids.map(encodeBytes).sort();
