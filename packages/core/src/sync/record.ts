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
import type { Certificate } from "../membership/certificate.ts";
import {
  certificateFor,
  certificateOf,
  idKey,
  type LogState,
  type Trust,
} from "../membership/verify-log.ts";
import { err, ok, type Result } from "../result.ts";
import { bytes } from "./bytes.ts";
import { EntryContent } from "./content.ts";
import { toWire } from "./wire.ts";

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
export const recordToWire = (record: EntryRecord) => toWire(record);

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
/** An entry key with the epoch it was sealed in */
export type EntryKey = { entryKey: Uint8Array; epoch: number };

/**
 * The entry key for the next version: the one the entry has, so a share covers later versions too
 * (P-10), but a new one in a new epoch, so a key change also changes every entry key (P-11)
 */
export const entryKeyFor = (ring: VaultKeyring, known: EntryKey | undefined): EntryKey =>
  known?.epoch === ring.epoch ? known : { entryKey: newEntryKey(), epoch: ring.epoch };

export const sealRecord = (
  author: Author,
  ring: VaultKeyring,
  entryId: Uint8Array,
  version: number,
  content: EntryContent,
  lastSeen: Uint8Array,
  key?: EntryKey,
): EntryRecord => {
  const at = { vaultId: ring.vaultId, entryId, epoch: ring.epoch };
  const { entryKey } = entryKeyFor(ring, key);
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

/** JSON as a value, so content that does not parse is an error value, not a throw */
export const parseJson = (text: string): Result<unknown, "not-json"> => {
  try {
    return ok(JSON.parse(text));
  } catch {
    return err("not-json");
  }
};

export type AcceptError =
  | "not-json"
  | "malformed"
  | "wrong-vault"
  | "stale"
  | "uncertified-author"
  | "bad-signature"
  | "not-editor"
  | "unreadable";

/** Whether the record's signature is the author's, by the key of the given certificate */
export const isSignedBy = (certificate: Certificate, record: EntryRecord) =>
  verify(certificate.edPublicKey, record.signature, "entry", ...signedFields(record));

/** The content opened with its entry key, as an entry */
export const readContent = (
  entryKey: Uint8Array,
  record: EntryRecord,
): Result<EntryContent, "unreadable" | "not-json" | "malformed"> => {
  const at = { vaultId: record.vaultId, entryId: record.entryId, epoch: record.epoch };
  const plain = openEntry(entryKey, record.content, at, record.version);
  if (!plain.ok) return err("unreadable");
  const json = parseJson(new TextDecoder().decode(plain.value));
  if (!json.ok) return json;
  const parsed = EntryContent.safeParse(json.value);
  return parsed.success ? ok(parsed.data) : err("malformed");
};

export type Opened = { content: EntryContent; entryKey: Uint8Array };

/** Opens a record as openRecord does, and gives its entry key too, to seal the next version with */
export const openRecordWithKey = (
  record: EntryRecord,
  ring: VaultKeyring,
  log: LogState,
  trust: Trust,
  knownVersion: number,
): Result<Opened, AcceptError> => {
  if (idKey(record.vaultId) !== idKey(ring.vaultId) || record.epoch !== ring.epoch)
    return err("wrong-vault");
  if (record.version <= knownVersion) return err("stale");
  // Signed by the company root for this author, and the very certificate the signed log names for
  // the member: a server cannot file another key under an editor (E-05, found by K-206). After the
  // author renewed her keys (P-12) that is her old bundle until a rekey entry names the new one
  const member = log.members.get(idKey(record.author));
  const certificate = member
    ? certificateFor(trust, record.author, member.fingerprint)
    : certificateOf(trust, record.author);
  if (!certificate) return err("uncertified-author");
  if (!isSignedBy(certificate, record)) return err("bad-signature");
  if (member?.role !== "edit" && member?.role !== "manage") return err("not-editor");
  const at = { vaultId: record.vaultId, entryId: record.entryId, epoch: record.epoch };
  const entryKey = openEntryKey(ring.vaultKey, record.entryKey, at);
  if (!entryKey.ok) return err("unreadable");
  const content = readContent(entryKey.value, record);
  return content.ok ? ok({ content: content.value, entryKey: entryKey.value }) : content;
};

export const openRecord = (
  record: EntryRecord,
  ring: VaultKeyring,
  log: LogState,
  trust: Trust,
  knownVersion: number,
): Result<EntryContent, AcceptError> => {
  const opened = openRecordWithKey(record, ring, log, trust, knownVersion);
  return opened.ok ? ok(opened.value.content) : opened;
};
