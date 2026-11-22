/**
 * A member's renewed keys in the vaults (K-307 part e, P-12), without any interface: once the root
 * certified the new bundle, every vault whose log still names the old one gets a `rekey` entry,
 * from the member's own client with the new keys, or from a manager's for someone else. The log
 * then wants a rotation, which a manager's client signs as after an exit (exit.ts), with nobody to
 * mark: the person stays the same. Until both are there, nobody writes in the vault.
 */
import type { Loaded, Vault } from "@kennwort/client/vaults/vaults.ts";
import {
  certificateFingerprint,
  dueRekeys,
  idKey,
  type LogEntry,
  rekeyMember,
  type Signer,
  type Trust,
  verifyLog,
} from "@kennwort/core";
import { constantTimeEqual, type KeyBlock, keyBlockFingerprint } from "@kennwort/crypto";
import type { ExitDeps } from "./exit.ts";

/** Signed times never go back (P-06): at least the newest entry's time */
const timeFor = (vault: Vault) => Math.max(Math.floor(Date.now() / 1000), vault.log.time);

/**
 * The rekey entries this account may sign in the vault: its own, with the keys the new certificate
 * names, and as a manager everyone else's; each checked against the log as it then stands
 */
export const renewalEntries = (signer: Signer, block: KeyBlock, vault: Vault, trust: Trust) => {
  const time = timeFor(vault);
  const now = { ...trust, now: time };
  const vaultId = vault.ring.vaultId;
  const mine = idKey(signer.accountId);
  const manages = vault.log.members.get(mine)?.role === "manage";
  const own = (c: { accountId: Uint8Array }) => idKey(c.accountId) === mine;
  const due = dueRekeys(vault.log, trust).filter((c) =>
    own(c) ? constantTimeEqual(certificateFingerprint(c), keyBlockFingerprint(block)) : manages,
  );
  let log = vault.entries;
  let state = vault.log;
  const made: LogEntry[] = [];
  for (const certificate of due) {
    const entry = rekeyMember(signer, state, vaultId, certificate, time);
    if (!entry.ok) break;
    const checked = verifyLog(vaultId, [...log, entry.value], now);
    if (!checked.ok) break;
    log = [...log, entry.value];
    state = checked.value;
    made.push(entry.value);
  }
  return made;
};

/**
 * Signs and sends the rekey entries every loaded vault still owes, once per vault and log state;
 * true when the server took any, so the vaults load anew and a manager's client rotates
 */
export const catchUpRenewals = async (deps: ExitDeps, loaded: Loaded, tried: Set<string>) => {
  const opened = deps.session.opened();
  if (!opened) return false;
  const signer = { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey };
  let appended = false;
  for (const vault of loaded.vaults) {
    const attempt = `rekey:${vault.idText}:${vault.log.seq}`;
    if (tried.has(attempt)) continue;
    const entries = renewalEntries(signer, opened.keyBlock, vault, loaded.trust);
    if (entries.length === 0) continue;
    tried.add(attempt);
    for (const entry of entries) {
      if ((await deps.api.appendLog(opened.token, entry)) !== "ok") break;
      appended = true;
    }
  }
  return appended;
};
