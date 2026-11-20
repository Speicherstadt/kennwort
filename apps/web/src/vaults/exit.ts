/**
 * Leaving a vault (K-307 part b, P-11), without any interface: a manager's client signs `remove`
 * for each person and `rotate` right after, with the new vault key wrapped to every member the log
 * still names (rotateVaultKey); then it writes every entry again under the new key, marked "to
 * change" for what the person could read, and makes the entries' shares again under their new
 * entry keys, as a revoke does (P-10). After unlock it catches up on what its vaults still owe:
 * people who left the company, and a removal the server kept without its rotation (dueExits).
 */

import type { Rotated } from "@kennwort/client/entries/entry-rotation.ts";
import type { SaveError } from "@kennwort/client/entries/entry-store.ts";
import type { ShareApi } from "@kennwort/client/session/shares-api.ts";
import type { Loaded, Vault, VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import {
  dueExits,
  type Exposure,
  encodeBytes,
  genuineShares,
  type LogEntry,
  pastExposures,
  removeMember,
  reshare,
  rotateVaultKey,
  type Trust,
  verifyLog,
  type WrappedKey,
} from "@kennwort/core";
import type { Session } from "../session/session.ts";
import { type ChangeError, fromIdKey } from "./vault-members.ts";

export type ExitDeps = { api: VaultDeps & ShareApi; session: Session };

/** What leaving needs of the app's stores: the vaults loaded anew, the entries written anew */
export type ExitStores = {
  /** Loads the vaults and their entries anew; undefined when that failed */
  reload: () => Promise<Loaded | undefined>;
  rotate: (
    vaultIdText: string,
    exposure: Exposure,
  ) => Promise<{ ok: true; value: Rotated } | { ok: false; error: SaveError }>;
  /** Whether the vault still has entries from before its current epoch */
  behind: (vaultIdText: string) => boolean;
};

export type ExitError = ChangeError | SaveError | "not-member" | "uncertified-member";
type Done = { ok: true } | { ok: false; error: ExitError };

/** Signed times never go back (P-06): at least the newest entry's time */
const timeFor = (vault: Vault) => Math.max(Math.floor(Date.now() / 1000), vault.log.time);

type Signer = { accountId: Uint8Array; edSecretKey: Uint8Array };
type Exit = { entries: LogEntry[]; wrappedKeys: WrappedKey[] };

/**
 * The entries that take these people out and rotate the key: each removal checked against the log
 * as it then stands, the rotation for the members after the last one
 */
const exitEntries = (
  signer: Signer,
  vault: Vault,
  trust: Trust,
  remove: readonly Uint8Array[],
): { ok: true; value: Exit } | { ok: false; error: "not-member" | "uncertified-member" } => {
  const time = timeFor(vault);
  const now = { ...trust, now: time };
  const vaultId = vault.ring.vaultId;
  let log = vault.entries;
  let state = vault.log;
  for (const accountId of remove) {
    const entry = removeMember(signer, state, vaultId, accountId, time);
    const checked = verifyLog(vaultId, [...log, entry], now);
    if (!checked.ok) return { ok: false, error: "not-member" };
    log = [...log, entry];
    state = checked.value;
  }
  const rotation = rotateVaultKey(signer, state, vaultId, now, time);
  if (!rotation.ok) return rotation;
  const entries = [...log.slice(vault.entries.length), rotation.value.entry];
  return { ok: true, value: { entries, wrappedKeys: rotation.value.wrappedKeys } };
};

const authorOf = (session: Session) => {
  const opened = session.opened();
  return opened
    ? {
        token: opened.token,
        signer: { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey },
        author: { id: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey },
      }
    : undefined;
};

/**
 * The shares of every entry the rotation wrote anew, made again under its new entry key: only those
 * genuine under the key of the version it replaced, signed by someone who still edits the vault,
 * and to nobody who left. An entry someone wrote in between keeps its shares as they are.
 */
const shareAgain = async (deps: ExitDeps, vault: Vault, rotated: Rotated, trust: Trust) => {
  const me = authorOf(deps.session);
  if (!me) return;
  const now = { ...trust, now: Math.floor(Date.now() / 1000) };
  const gone = new Set(pastExposures(vault.entries).map((e) => e.account));
  for (const [key, after] of rotated.after) {
    const before = rotated.before.get(key);
    if (!before?.key || !after.key || after.version !== before.version + 1) continue;
    const place = { vaultId: vault.ring.vaultId, entryId: after.entryId };
    const listed = await deps.api.entryShares(me.token, place.vaultId, place.entryId);
    const remaining = genuineShares(
      listed ?? [],
      before.key.entryKey,
      place,
      vault.log,
      now,
    ).filter((share) => !gone.has(encodeBytes(share.recipient)));
    const again = reshare(me.author, after.key.entryKey, remaining, now, now.now);
    await Promise.all(again.map((share) => deps.api.putShare(me.token, share)));
  }
};

/** Writes the vault's entries anew under its current key and makes their shares again */
const rewrite = async (deps: ExitDeps, stores: ExitStores, loaded: Loaded, idText: string) => {
  const vault = loaded.vaults.find((v) => v.idText === idText);
  // The newest exit: the context marks for every other one as well (SyncContext.exposures)
  const exposure = vault && pastExposures(vault.entries).at(-1);
  if (!vault || !exposure) return { ok: false, error: "unreachable" } as const;
  const rotated = await stores.rotate(idText, exposure);
  if (!rotated.ok) return rotated;
  await shareAgain(deps, vault, rotated.value, loaded.trust);
  return { ok: true } as const;
};

/**
 * Takes these people out of the vault and rotates its key (P-11); with nobody to remove, only the
 * rotation a removal still owes. Each entry goes to the server in turn: a refused one leaves the
 * rest unsent, and a removal without its rotation is caught up later.
 */
export const exitVault = async (
  deps: ExitDeps,
  stores: ExitStores,
  vault: Vault,
  trust: Trust,
  remove: readonly Uint8Array[],
): Promise<Done> => {
  const me = authorOf(deps.session);
  if (!me) return { ok: false, error: "locked" };
  const exit = exitEntries(me.signer, vault, trust, remove);
  if (!exit.ok) return exit;
  for (const entry of exit.value.entries) {
    const keys = entry.action === "rotate" ? exit.value.wrappedKeys : undefined;
    const appended = await deps.api.appendLog(me.token, entry, undefined, keys);
    if (appended !== "ok") return { ok: false, error: appended };
  }
  const loaded = await stores.reload();
  if (!loaded) return { ok: false, error: "unreachable" };
  return rewrite(deps, stores, loaded, vault.idText);
};

/** The vaults this account manages that owe a removal or a rotation */
export const dueVaults = (loaded: Loaded) =>
  loaded.vaults.filter((v) => v.role === "manage" && dueExits(v.log, loaded.left).rotate);

/**
 * What a manager's client owes after unlock (P-11): every vault it manages that still names
 * someone who left the company, or kept a removal without its rotation, gets both now; one whose
 * rotation left entries in an older epoch (the writing failed, or the server hid them from the
 * rotating device) gets them written anew. Each vault is tried once per log state (`tried`), so a
 * failing exit does not loop through every load; gives the vaults that failed.
 */
export const catchUp = async (
  deps: ExitDeps,
  stores: ExitStores,
  loaded: Loaded,
  tried: Set<string>,
): Promise<{ idText: string; error: ExitError }[]> => {
  const failed: { idText: string; error: ExitError }[] = [];
  for (const vault of loaded.vaults.filter((v) => v.role === "manage")) {
    const due = dueExits(vault.log, loaded.left);
    const attempt = `${vault.idText}:${vault.log.seq}`;
    if ((!due.rotate && !stores.behind(vault.idText)) || tried.has(attempt)) continue;
    tried.add(attempt);
    const done = due.rotate
      ? await exitVault(deps, stores, vault, loaded.trust, due.remove.map(fromIdKey))
      : await rewrite(deps, stores, loaded, vault.idText);
    if (!done.ok) failed.push({ idText: vault.idText, error: done.error });
  }
  return failed;
};

/**
 * Exits one at a time: a reload in the middle of an exit starts a catch-up, which waits until the
 * exit is done and then sees the vault as the exit left it, instead of writing the same entries
 * at the same time
 */
export const createExits = (deps: ExitDeps, stores: ExitStores) => {
  const tried = new Set<string>();
  let last: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(run: () => Promise<T>) => {
    const next = last.then(run);
    last = next.catch(() => undefined);
    return next;
  };
  return {
    remove: (vault: Vault, trust: Trust, accountId: Uint8Array) =>
      oneAtATime(() => exitVault(deps, stores, vault, trust, [accountId])),
    catchUp: (loaded: Loaded) => oneAtATime(() => catchUp(deps, stores, loaded, tried)),
  };
};

export type Exits = ReturnType<typeof createExits>;
