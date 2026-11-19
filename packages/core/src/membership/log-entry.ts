/**
 * Entries of the membership log of docs/sicherheitsdesign.md (P-06): one hash chain per vault,
 * every entry signed by its signer.
 *
 *   entry = enc("kennwort/log/v1", vault, seq, prevHash, epoch, action, account, fingerprint, role,
 *               validUntil, vkCommitment, time, signer, lastSeen) ‖ F-03(signer, "log", …)
 *   hash  = SHA-512/256(entry)
 */
import { DIGEST_LENGTH, digest, encode, sign } from "@kennwort/crypto";

export type Action = "create" | "add" | "remove" | "role" | "rotate";
export type VaultRole = "read" | "edit" | "manage";

export type LogFields = {
  vaultId: Uint8Array;
  seq: number;
  prevHash: Uint8Array;
  epoch: number;
  action: Action;
  accountId: Uint8Array;
  /** Fingerprint of the subject's certified bundle; empty for remove */
  fingerprint: Uint8Array;
  role: VaultRole | "";
  /** Unix seconds after which the access ends; 0 for none */
  validUntil: number;
  /** Commitment to the vault key of this epoch (F-02); empty for remove and role */
  vkCommitment: Uint8Array;
  time: number;
  signerId: Uint8Array;
  /** Hash of the newest log state the signer had seen, against forks (E-08) */
  lastSeen: Uint8Array;
};

export type LogEntry = LogFields & { signature: Uint8Array };

export const GENESIS_HASH = new Uint8Array(DIGEST_LENGTH);

export const entryBytes = (f: LogFields) =>
  encode(
    "kennwort/log/v1",
    f.vaultId,
    f.seq,
    f.prevHash,
    f.epoch,
    f.action,
    f.accountId,
    f.fingerprint,
    f.role,
    f.validUntil,
    f.vkCommitment,
    f.time,
    f.signerId,
    f.lastSeen,
  );

export const signEntry = (signerSecretKey: Uint8Array, fields: LogFields): LogEntry => ({
  ...fields,
  signature: sign(signerSecretKey, "log", entryBytes(fields)),
});

/** SHA-512/256 over the encoded entry followed by its signature, as P-06 defines it */
export const entryHash = (entry: LogEntry) => {
  const bytes = entryBytes(entry);
  const whole = new Uint8Array(bytes.length + entry.signature.length);
  whole.set(bytes);
  whole.set(entry.signature, bytes.length);
  return digest(whole);
};
