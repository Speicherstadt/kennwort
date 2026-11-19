/**
 * Vault and entry keys of docs/sicherheitsdesign.md (P-05, P-09, P-11): a vault key per epoch,
 * wrapped to every member and bound by a commitment in the signed membership log; an entry key per
 * entry under the vault key; the entry's content under its entry key, padded to 256 bytes.
 */
import { randomBytes } from "@noble/hashes/utils.js";
import { open, seal } from "./box.ts";
import { constantTimeEqual, keyCommitment } from "./commitment.ts";
import { err, type Result } from "./result.ts";
import { type Recipient, unwrap, wrap } from "./wrap.ts";

export const newVaultKey = () => randomBytes(32);
export const newEntryKey = () => randomBytes(32);

export type VaultPlace = { vaultId: Uint8Array; epoch: number };
export type EntryPlace = VaultPlace & { entryId: Uint8Array };

/** The commitment to VKₑ that `anlegen`, `aufnehmen` and `schlüsselwechsel` carry in the log */
export const vaultKeyCommitment = (vaultKey: Uint8Array, { vaultId, epoch }: VaultPlace) =>
  keyCommitment(vaultKey, "vault-key", vaultId, epoch);

const memberPlace = ({ vaultId, epoch }: VaultPlace, memberId: Uint8Array) => ({
  purpose: "vault-key",
  context: [vaultId, epoch, memberId],
});

export const wrapVaultKey = (
  member: Recipient,
  memberId: Uint8Array,
  vaultKey: Uint8Array,
  at: VaultPlace,
) => wrap(member, vaultKey, memberPlace(at, memberId));

export type VaultKeyError = "not-authentic" | "not-committed";

/** Unwraps VKₑ and accepts it only if it matches the signed commitment of its epoch (E-16) */
export const unwrapVaultKey = (
  me: { secretKey: Uint8Array; fingerprint: Uint8Array; memberId: Uint8Array },
  pkg: Uint8Array,
  at: VaultPlace,
  signedCommitment: Uint8Array,
): Result<Uint8Array, VaultKeyError> => {
  const opened = unwrap(me.secretKey, me.fingerprint, pkg, memberPlace(at, me.memberId));
  if (!opened.ok) return err("not-authentic");
  if (!constantTimeEqual(vaultKeyCommitment(opened.value, at), signedCommitment))
    return err("not-committed");
  return opened;
};

const entryKeyPlace = ({ vaultId, entryId, epoch }: EntryPlace) => ({
  purpose: "entry-key",
  context: [vaultId, entryId, epoch],
});

export const sealEntryKey = (vaultKey: Uint8Array, entryKey: Uint8Array, at: EntryPlace) =>
  seal(vaultKey, entryKey, entryKeyPlace(at));

export const openEntryKey = (vaultKey: Uint8Array, sealed: Uint8Array, at: EntryPlace) => {
  const opened = open(vaultKey, sealed, entryKeyPlace(at));
  return opened.ok && opened.value.length === 32 ? opened : err("not-authentic" as const);
};

export const PADDING_BLOCK = 256;

/** ISO/IEC 7816-4 padding to a multiple of 256 bytes, so a ciphertext tells little about its length */
export const pad = (content: Uint8Array): Uint8Array => {
  const padded = new Uint8Array((Math.floor(content.length / PADDING_BLOCK) + 1) * PADDING_BLOCK);
  padded.set(content);
  padded[content.length] = 0x80;
  return padded;
};

export const unpad = (padded: Uint8Array): Result<Uint8Array, "malformed"> => {
  // An empty block has no 0x80 marker either, so the check below refuses it too
  if (padded.length % PADDING_BLOCK !== 0) return err("malformed");
  const end = padded.findLastIndex((byte) => byte !== 0);
  if (padded[end] !== 0x80) return err("malformed");
  return { ok: true, value: padded.slice(0, end) };
};

const contentPlace = ({ vaultId, entryId }: EntryPlace, version: number) => ({
  purpose: "entry",
  context: [vaultId, entryId, version],
});

export const sealEntry = (
  entryKey: Uint8Array,
  content: Uint8Array,
  at: EntryPlace,
  version: number,
) => seal(entryKey, pad(content), contentPlace(at, version));

export const openEntry = (
  entryKey: Uint8Array,
  sealed: Uint8Array,
  at: EntryPlace,
  version: number,
): Result<Uint8Array, "not-authentic" | "malformed"> => {
  const opened = open(entryKey, sealed, contentPlace(at, version));
  return opened.ok ? unpad(opened.value) : err("not-authentic");
};
