/**
 * The account state (docs/sicherheitsdesign.md, Schlüsselhierarchie): what a client remembers to
 * check the server, sealed under AK with the account ID and a counter (purpose account-state).
 * Every device merges it with its own: the higher state wins, another root key is an attack.
 */
import { constantTimeEqual, open, seal } from "@kennwort/crypto";
import { z } from "zod";
import { err, ok, type Result } from "../result.ts";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { parseJson } from "../sync/record.ts";
import { EmergencySeen, mergeEmergency } from "./emergency-seen.ts";

const Remembered = z.object({ seq: z.number().int().nonnegative(), hash: bytes(32) });

export const AccountState = z.object({
  rootFingerprint: bytes(32),
  /** The company root's private key, only in an owner's state (P-07; further owners: K-304) */
  rootSecretKey: bytes(32).optional(),
  /** Bundle fingerprints of accounts the client has seen, by account ID */
  bundles: z.record(z.string(), bytes(32)),
  /** The newest state of each membership log, by vault ID */
  logs: z.record(z.string(), Remembered),
  /** The highest version of each entry, by entry ID */
  versions: z.record(z.string(), z.number().int().positive()),
  /**
   * Invitations this account's admin client has certified, by invitation ID, with the account it
   * certified: one invitation makes one member, whatever the server shows later (K-304)
   */
  invitations: z.record(z.string(), z.string()).default({}),
  /**
   * The newest certificate seen per account, as its issue time: an older one is a role the server
   * plays back after an owner changed it (review of K-304)
   */
  certificates: z.record(z.string(), z.number().int().nonnegative()).default({}),
  /** The newest company policy version seen (K-304): an older one is a rollback */
  policy: z.number().int().nonnegative().default(0),
  /**
   * That policy's lock time, kept for when the server later serves none or a bad one: the client
   * stays with the last valid policy instead of falling back to the standard (review of K-304)
   */
  policyLock: z.number().int().min(1).max(60).default(10),
  /**
   * The sites the extension never offers to save a login for ("Nie für diese Seite", K-404), by
   * exact host: kept here so every device of the account knows them and no store on the disk does
   */
  neverSave: z.array(z.string()).default([]),
  /**
   * Emergency access granted to this account, by grantor ID (K-307 part d, P-14): the newest grant
   * seen, whether it was revoked, and the newest request objected to
   */
  emergency: z.record(z.string(), EmergencySeen).default({}),
  /**
   * The personal vault's ID (K-307 part e): derived from AK when the vault was made; once AK is
   * renewed (P-12) the derivation gives another one, so the state keeps the first
   */
  personalVault: z.string().optional(),
});
export type AccountState = z.infer<typeof AccountState>;

const place = (accountId: Uint8Array, counter: number) => ({
  purpose: "account-state",
  context: [accountId, counter],
});

const toJson = (state: AccountState) =>
  JSON.stringify({
    ...state,
    rootFingerprint: encodeBytes(state.rootFingerprint),
    ...(state.rootSecretKey ? { rootSecretKey: encodeBytes(state.rootSecretKey) } : {}),
    bundles: Object.fromEntries(
      Object.entries(state.bundles).map(([id, fp]) => [id, encodeBytes(fp)]),
    ),
    logs: Object.fromEntries(
      Object.entries(state.logs).map(([id, log]) => [
        id,
        { seq: log.seq, hash: encodeBytes(log.hash) },
      ]),
    ),
  });

export const sealState = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  counter: number,
  state: AccountState,
) => seal(accountKey, new TextEncoder().encode(toJson(state)), place(accountId, counter));

export type StateError = "not-authentic" | "malformed";

/** The counter is part of the AAD: a state played back under another counter does not open */
export const openState = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  counter: number,
  sealed: Uint8Array,
): Result<AccountState, StateError> => {
  const opened = open(accountKey, sealed, place(accountId, counter));
  if (!opened.ok) return err("not-authentic");
  const parsed = z
    .object({ ok: z.literal(true), value: AccountState })
    .safeParse(parseJson(new TextDecoder().decode(opened.value)));
  return parsed.success ? ok(parsed.data.value) : err("malformed");
};

/**
 * Each log's state from the side that has seen more of it. The same place with another hash means
 * the server showed the two devices different logs (E-08): an attack, not an update (P-06).
 */
const newerLogs = (mine: AccountState["logs"], theirs: AccountState["logs"]) => {
  const merged = { ...mine };
  for (const [key, value] of Object.entries(theirs)) {
    const own = merged[key];
    if (own === undefined || value.seq > own.seq) merged[key] = value;
    else if (value.seq === own.seq && !constantTimeEqual(own.hash, value.hash)) return undefined;
  }
  return merged;
};

/** The later issue time of each account's certificate from either side */
export const newest = (mine: Record<string, number>, theirs: Record<string, number>) =>
  Object.fromEntries(
    [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].map((id) => [
      id,
      Math.max(mine[id] ?? 0, theirs[id] ?? 0),
    ]),
  );

/** The policy version and its lock time from the side that saw the newer one */
const newerPolicy = (mine: AccountState, theirs: AccountState) => {
  const newer = theirs.policy > mine.policy ? theirs : mine;
  return { policy: newer.policy, policyLock: newer.policyLock };
};

export type MergeError = "other-root" | "other-bundle" | "other-log" | "other-invitation";

/**
 * Each account's bundle from either side. Another bundle for a known account counts only from the
 * side that saw a newer certificate for it: the account renewed its keys (P-12); with none newer
 * it is an attack (P-07)
 */
const mergeBundles = (mine: AccountState, theirs: AccountState) => {
  const merged = { ...theirs.bundles, ...mine.bundles };
  for (const [id, fingerprint] of Object.entries(theirs.bundles)) {
    const known = mine.bundles[id];
    if (!known || constantTimeEqual(known, fingerprint)) continue;
    const mineAt = mine.certificates[id] ?? 0;
    const theirsAt = theirs.certificates[id] ?? 0;
    if (theirsAt > mineAt) merged[id] = fingerprint;
    else if (theirsAt === mineAt) return undefined;
  }
  return merged;
};

/** Both devices' knowledge, the higher of each; a different root or bundle for one account is refused */
export const mergeStates = (
  mine: AccountState,
  theirs: AccountState,
): Result<AccountState, MergeError> => {
  if (!constantTimeEqual(mine.rootFingerprint, theirs.rootFingerprint)) return err("other-root");
  const bundles = mergeBundles(mine, theirs);
  if (!bundles) return err("other-bundle");
  const logs = newerLogs(mine.logs, theirs.logs);
  if (!logs) return err("other-log");
  for (const [id, account] of Object.entries(theirs.invitations)) {
    const known = mine.invitations[id];
    if (known !== undefined && known !== account) return err("other-invitation");
  }
  const rootSecretKey = mine.rootSecretKey ?? theirs.rootSecretKey;
  return ok({
    rootFingerprint: mine.rootFingerprint,
    ...(rootSecretKey ? { rootSecretKey } : {}),
    bundles,
    logs,
    versions: Object.fromEntries(
      [...new Set([...Object.keys(mine.versions), ...Object.keys(theirs.versions)])].map((id) => [
        id,
        Math.max(mine.versions[id] ?? 0, theirs.versions[id] ?? 0),
      ]),
    ),
    invitations: { ...theirs.invitations, ...mine.invitations },
    certificates: newest(mine.certificates, theirs.certificates),
    ...newerPolicy(mine, theirs),
    neverSave: [...new Set([...mine.neverSave, ...theirs.neverSave])].sort(),
    emergency: mergeEmergency(mine.emergency, theirs.emergency),
    ...personalOf(mine, theirs),
  });
};

const personalOf = (mine: AccountState, theirs: AccountState) => {
  const personalVault = mine.personalVault ?? theirs.personalVault;
  return personalVault ? { personalVault } : {};
};

export const emptyState = (
  rootFingerprint: Uint8Array,
  rootSecretKey?: Uint8Array,
): AccountState => ({
  rootFingerprint,
  ...(rootSecretKey ? { rootSecretKey } : {}),
  bundles: {},
  logs: {},
  versions: {},
  invitations: {},
  certificates: {},
  policy: 0,
  policyLock: 10,
  neverSave: [],
  emergency: {},
});
