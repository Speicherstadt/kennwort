/**
 * An entry on the wire and how a client seals and accepts it (docs/sicherheitsdesign.md, P-09):
 * entry key under the vault key, content under the entry key, both bound to vault, entry and
 * version, signed by the author; the client accepts a record only from an author who may edit, and
 * never an older version than it has seen (E-13).
 */
import {
  digest,
  encode,
  newEntryKey,
  openEntry,
  openEntryKey,
  sealEntry,
  sealEntryKey,
  sign,
  verify,
} from "@kennwort/crypto";
import { z } from "zod";
import { idKey, type LogState, type Trust } from "../membership/verify-log.ts";
import { err, ok, type Result } from "../result.ts";
import { bytes, encodeBytes } from "./bytes.ts";
import { EntryContent } from "./content.ts";

export const EntryRecord = z.object({
  vaultId: bytes(16),
  entryId: bytes(16),
  version: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
  entryKey: bytes(),
  content: bytes(),
  author: bytes(16),
  lastSeen: bytes(),
  signature: bytes(65),
});
export type EntryRecord = z.infer<typeof EntryRecord>;

/** A record as JSON for the wire; EntryRecord.parse reads it back */
export const recordToWire = (record: EntryRecord) =>
  Object.fromEntries(
    Object.entries(record).map(([name, value]) => [
      name,
      value instanceof Uint8Array ? encodeBytes(value) : value,
    ]),
  );

const signedFields = (r: Omit<EntryRecord, "signature">) =>
  [
    r.vaultId,
    r.entryId,
    r.version,
    r.epoch,
    digest(encode(r.entryKey, r.content)),
    r.lastSeen,
  ] as const;

export type Author = { id: Uint8Array; edSecretKey: Uint8Array };
export type VaultKeyring = { vaultId: Uint8Array; epoch: number; vaultKey: Uint8Array };

export const sealRecord = (
  author: Author,
  ring: VaultKeyring,
  entryId: Uint8Array,
  version: number,
  content: EntryContent,
  lastSeen: Uint8Array,
): EntryRecord => {
  const at = { vaultId: ring.vaultId, entryId, epoch: ring.epoch };
  const entryKey = newEntryKey();
  const unsigned = {
    vaultId: ring.vaultId,
    entryId,
    version,
    epoch: ring.epoch,
    entryKey: sealEntryKey(ring.vaultKey, entryKey, at),
    content: sealEntry(entryKey, new TextEncoder().encode(JSON.stringify(content)), at, version),
    author: author.id,
    lastSeen,
  };
  return { ...unsigned, signature: sign(author.edSecretKey, "entry", ...signedFields(unsigned)) };
};

export type AcceptError =
  | "wrong-vault"
  | "stale"
  | "uncertified-author"
  | "bad-signature"
  | "not-editor"
  | "unreadable";

export const openRecord = (
  record: EntryRecord,
  ring: VaultKeyring,
  log: LogState,
  trust: Trust,
  knownVersion: number,
): Result<EntryContent, AcceptError> => {
  if (idKey(record.vaultId) !== idKey(ring.vaultId) || record.epoch !== ring.epoch)
    return err("wrong-vault");
  if (record.version <= knownVersion) return err("stale");
  const certificate = trust.certificates.get(idKey(record.author));
  if (!certificate) return err("uncertified-author");
  if (!verify(certificate.edPublicKey, record.signature, "entry", ...signedFields(record)))
    return err("bad-signature");
  const role = log.members.get(idKey(record.author))?.role;
  if (role !== "edit" && role !== "manage") return err("not-editor");
  const at = { vaultId: record.vaultId, entryId: record.entryId, epoch: record.epoch };
  const entryKey = openEntryKey(ring.vaultKey, record.entryKey, at);
  if (!entryKey.ok) return err("unreadable");
  const plain = openEntry(entryKey.value, record.content, at, record.version);
  if (!plain.ok) return err("unreadable");
  const parsed = EntryContent.safeParse(JSON.parse(new TextDecoder().decode(plain.value)));
  return parsed.success ? ok(parsed.data) : err("unreadable");
};
