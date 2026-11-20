/**
 * The key rotation of P-11 (docs/sicherheitsdesign.md): a new vault key for the next epoch, wrapped
 * to every member the checked log still names and only through a certificate the company root
 * signed for that member's logged fingerprint (E-05), committed to in a signed `rotate` entry
 * (F-02, E-16). Someone who left keeps the keys of the epochs they had; the next epoch's key never
 * reaches them, so what is written after it stays closed to them (E-26). As in Bitwarden's and
 * 1Password's white papers, leaving does not undo what was read: that is what change marks are for.
 */
import {
  constantTimeEqual,
  type KeyBlock,
  newVaultKey,
  vaultKeyCommitment,
} from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { type Certificate, certificateFingerprint } from "./certificate.ts";
import { entryHash, type LogEntry, signEntry } from "./log-entry.ts";
import {
  type Keyring,
  nextLink,
  type OpenKeyError,
  openVaultKey,
  removeMember,
  type Signer,
  wrapTo,
} from "./vault-ops.ts";
import { certificateOf, idKey, type LogState, type Member, type Trust } from "./verify-log.ts";

export type WrappedKey = { accountId: Uint8Array; wrapped: Uint8Array };
export type Rotation = { ring: Keyring; entry: LogEntry; wrappedKeys: WrappedKey[] };
export type RotateError = "uncertified-member";

/** The member's certificate, if the root signed it for this very account and the logged keys */
const certifiedMember = (trust: Trust, key: string, member: Member) => {
  const listed = trust.certificates.get(key);
  const certificate = listed && certificateOf(trust, listed.accountId);
  return certificate &&
    idKey(certificate.accountId) === key &&
    constantTimeEqual(certificateFingerprint(certificate), member.fingerprint)
    ? certificate
    : undefined;
};

/**
 * A new vault key for the next epoch, wrapped to every member of the log, also those whose time ran
 * out (a later `role` entry lets them in again, and the server hands keys only to current members)
 */
export const rotateVaultKey = (
  signer: Signer,
  state: LogState,
  vaultId: Uint8Array,
  trust: Trust,
  time: number,
  vaultKey: Uint8Array = newVaultKey(),
): Result<Rotation, RotateError> => {
  const ring = { vaultId, epoch: state.epoch + 1, vaultKey };
  const recipients: Certificate[] = [];
  for (const [key, member] of state.members) {
    const certificate = certifiedMember(trust, key, member);
    if (!certificate) return err("uncertified-member");
    recipients.push(certificate);
  }
  const entry = signEntry(signer.edSecretKey, {
    vaultId,
    ...nextLink(state),
    epoch: ring.epoch,
    action: "rotate",
    accountId: signer.accountId,
    fingerprint: new Uint8Array(),
    role: "",
    validUntil: 0,
    vkCommitment: vaultKeyCommitment(vaultKey, ring),
    time,
    signerId: signer.accountId,
  });
  const wrappedKeys = recipients.map((c) => ({ accountId: c.accountId, wrapped: wrapTo(c, ring) }));
  return ok({ ring, entry, wrappedKeys });
};

export type Exit = Rotation & { entries: [LogEntry, LogEntry] };

/** A member leaves: the removal and, right after it, the rotation, both signed by the manager */
export const removeAndRotate = (
  signer: Signer,
  state: LogState,
  vaultId: Uint8Array,
  accountId: Uint8Array,
  trust: Trust,
  time: number,
  vaultKey?: Uint8Array,
): Result<Exit, RotateError | "not-member"> => {
  if (!state.members.has(idKey(accountId))) return err("not-member");
  const remove = removeMember(signer, state, vaultId, accountId, time);
  const members = new Map(state.members);
  members.delete(idKey(accountId));
  const after = { ...state, seq: remove.seq, time, hash: entryHash(remove), members };
  const rotation = rotateVaultKey(signer, after, vaultId, trust, time, vaultKey);
  return rotation.ok
    ? ok({ ...rotation.value, entries: [remove, rotation.value.entry] })
    : rotation;
};

export type Rings = { current: Keyring; older: Keyring[] };
export type RingsError = "key-withheld" | OpenKeyError;

/**
 * The vault keys the server handed out, each taken only against the commitment of its epoch in the
 * checked log: the current epoch's to write, older ones to read what is not re-encrypted yet. No key
 * for the current epoch means the server withholds the rotation (E-26); a key of an epoch the log
 * does not show means it withholds part of the log (E-07).
 */
export const openRings = (
  keyBlock: KeyBlock,
  accountId: Uint8Array,
  state: LogState,
  vaultId: Uint8Array,
  keys: readonly { epoch: number; wrapped: Uint8Array }[],
): Result<Rings, RingsError> => {
  if (!keys.some((key) => key.epoch === state.epoch)) return err("key-withheld");
  const rings: Keyring[] = [];
  for (const key of keys) {
    const ring = openVaultKey(keyBlock, accountId, state, vaultId, key.epoch, key.wrapped);
    if (!ring.ok) return ring;
    rings.push(ring.value);
  }
  return ok({
    current: rings.find((ring) => ring.epoch === state.epoch) as Keyring,
    older: rings.filter((ring) => ring.epoch !== state.epoch),
  });
};

/**
 * What a manager's client still owes a vault: members who left the company (hex account IDs, as the
 * log state keys them) to remove, and whether a rotation is due, also after a removal the server
 * kept without its rotation
 */
export const dueExits = (state: LogState, left: ReadonlySet<string>) => {
  const remove = [...state.members.keys()].filter((key) => left.has(key));
  return { remove, rotate: state.rotationDue || remove.length > 0 };
};
