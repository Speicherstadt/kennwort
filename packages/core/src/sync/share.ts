/**
 * A single entry shared with a colleague outside its vault (docs/sicherheitsdesign.md, P-10): the
 * sharer wraps the entry key to the recipient's certified bundle and signs the share with its
 * binding, role and expiry; the recipient, who has no vault key and no vault log, reads the entry
 * with that key once share and record pass the checks below.
 */
import {
  constantTimeEqual,
  type ShareKeyError,
  type SharePlace,
  shareKeyCommitment,
  sign,
  unwrapShareKey,
  verify,
  wrapShareKey,
} from "@kennwort/crypto";
import { z } from "zod";
import { type Certificate, certificateFingerprint } from "../membership/certificate.ts";
import {
  certificateOf,
  idKey,
  isMember,
  type LogState,
  type Trust,
} from "../membership/verify-log.ts";
import { err, type Result } from "../result.ts";
import { bytes } from "./bytes.ts";
import type { EntryContent } from "./content.ts";
import { type Author, type EntryRecord, isSignedBy, readContent } from "./record.ts";
import { toWire } from "./wire.ts";

/** Version, X-Wing ciphertext and the box around the 32-byte entry key (F-02) */
export const WRAPPED_ENTRY_KEY_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

export const Share = z.object({
  vaultId: bytes(16),
  entryId: bytes(16),
  recipient: bytes(16),
  // Only reading for now; the role is signed, so "edit" can follow without a new format
  role: z.enum(["read"]),
  /** Seconds since the epoch; 0 for a share without expiry */
  validUntil: z.number().int().nonnegative(),
  commitment: bytes(32),
  wrappedKey: bytes(WRAPPED_ENTRY_KEY_LENGTH),
  sharer: bytes(16),
  time: z.number().int().nonnegative(),
  signature: bytes(65),
});
export type Share = z.infer<typeof Share>;

/** A share as JSON for the wire; Share.parse reads it back */
export const shareToWire = (share: Share) => toWire(share);

/** GET …/shares and GET /api/shared: shares as the server lists them */
export const SharesWire = z.object({ shares: z.array(Share) });

const signedFields = (s: Omit<Share, "signature">) =>
  [
    s.vaultId,
    s.entryId,
    s.recipient,
    s.role,
    s.validUntil,
    s.commitment,
    s.wrappedKey,
    s.sharer,
    s.time,
  ] as const;

/** Shares the entry key of one entry with the owner of a certificate the caller has checked */
export const makeShare = (
  author: Author,
  entryKey: Uint8Array,
  recipient: Certificate,
  place: SharePlace,
  { validUntil, time }: { validUntil: number; time: number },
): Share => {
  const to = {
    publicKey: recipient.xwingPublicKey,
    fingerprint: certificateFingerprint(recipient),
  };
  const unsigned = {
    vaultId: place.vaultId,
    entryId: place.entryId,
    recipient: recipient.accountId,
    role: "read" as const,
    validUntil,
    commitment: shareKeyCommitment(entryKey, place),
    wrappedKey: wrapShareKey(to, recipient.accountId, entryKey, place),
    sharer: author.id,
    time,
  };
  return { ...unsigned, signature: sign(author.edSecretKey, "share", ...signedFields(unsigned)) };
};

/** The recipient's own keys: account, X-Wing secret key and the fingerprint of its bundle */
export type ShareReader = { accountId: Uint8Array; secretKey: Uint8Array; fingerprint: Uint8Array };

export type SharedError =
  | "not-for-me"
  | "expired"
  | "uncertified-sharer"
  | "bad-signature"
  | ShareKeyError
  | "wrong-entry"
  | "rollback"
  | "uncertified-author"
  | "unreadable"
  | "not-json"
  | "malformed";

/** Whether the share is for this reader, still valid and signed by a certified sharer */
const checkShare = (share: Share, me: ShareReader, trust: Trust): SharedError | undefined => {
  if (idKey(share.recipient) !== idKey(me.accountId)) return "not-for-me";
  if (share.validUntil !== 0 && share.validUntil <= trust.now) return "expired";
  const sharer = certificateOf(trust, share.sharer);
  if (!sharer) return "uncertified-sharer";
  if (!verify(sharer.edPublicKey, share.signature, "share", ...signedFields(share)))
    return "bad-signature";
  return undefined;
};

/**
 * Opens the shared entry: the share as above, its entry key against the signed binding, and the
 * record of that very entry signed by a certified author, no older than the highest version the
 * reader has seen of it (E-13). Without the vault log the recipient cannot tell whether that
 * author may edit the vault; P-10 names this residual risk.
 */
export const openShared = (
  share: Share,
  record: EntryRecord,
  me: ShareReader,
  trust: Trust,
  seenVersion = 0,
): Result<EntryContent, SharedError> => {
  const refused = checkShare(share, me, trust);
  if (refused) return err(refused);
  const place = { vaultId: share.vaultId, entryId: share.entryId };
  const entryKey = unwrapShareKey(me, share.wrappedKey, place, share.commitment);
  if (!entryKey.ok) return entryKey;
  if (
    idKey(record.vaultId) !== idKey(share.vaultId) ||
    idKey(record.entryId) !== idKey(share.entryId)
  )
    return err("wrong-entry");
  if (record.version < seenVersion) return err("rollback");
  const author = certificateOf(trust, record.author);
  if (!author) return err("uncertified-author");
  if (!isSignedBy(author, record)) return err("bad-signature");
  return readContent(entryKey.value, record);
};

/** The certificate of a member who may edit the vault now, the very one the log names (E-05) */
const editorNow = (accountId: Uint8Array, log: LogState, trust: Trust) => {
  const certificate = certificateOf(trust, accountId);
  const member = log.members.get(idKey(accountId));
  if (!certificate || !member) return undefined;
  if (!constantTimeEqual(member.fingerprint, certificateFingerprint(certificate))) return undefined;
  const mayEdit = member.role === "edit" || member.role === "manage";
  return mayEdit && isMember(log, accountId, trust.now) ? certificate : undefined;
};

/**
 * The shares of an entry a member of its vault can trust, from what the server lists: signed by a
 * certified member who may edit the vault now, over the entry key given. A server that adds a share
 * of its own to the list gets it neither shown nor made again with a new key (P-10).
 */
export const genuineShares = (
  shares: readonly Share[],
  entryKey: Uint8Array,
  place: SharePlace,
  log: LogState,
  trust: Trust,
): Share[] =>
  shares.filter((share) => {
    const sharer = editorNow(share.sharer, log, trust);
    return (
      sharer !== undefined &&
      idKey(share.vaultId) === idKey(place.vaultId) &&
      idKey(share.entryId) === idKey(place.entryId) &&
      constantTimeEqual(share.commitment, shareKeyCommitment(entryKey, place)) &&
      verify(sharer.edPublicKey, share.signature, "share", ...signedFields(share))
    );
  });

/**
 * After a revoke the entry has a new entry key (P-10): the remaining shares made again under it, to
 * the same certified recipients with the same expiry, signed by the author. Shares that ran out or
 * whose recipient has no certificate any more are left out; the caller passes genuine ones only.
 */
export const reshare = (
  author: Author,
  entryKey: Uint8Array,
  shares: readonly Share[],
  trust: Trust,
  time: number,
): Share[] =>
  shares.flatMap((share) => {
    const recipient = certificateOf(trust, share.recipient);
    if (!recipient || (share.validUntil !== 0 && share.validUntil <= trust.now)) return [];
    const place = { vaultId: share.vaultId, entryId: share.entryId };
    return [makeShare(author, entryKey, recipient, place, { validUntil: share.validUntil, time })];
  });
