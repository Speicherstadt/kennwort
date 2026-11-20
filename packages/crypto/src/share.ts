/**
 * Sharing a single entry (docs/sicherheitsdesign.md, P-10): the sharer wraps the entry key EK to
 * the recipient's certified bundle (F-02, purpose `share`) and signs a binding to it; the recipient
 * takes the unwrapped EK only if it matches that signed binding, as with the vault key (E-16).
 */
import { constantTimeEqual, keyCommitment } from "./commitment.ts";
import { err, type Result } from "./result.ts";
import { type Recipient, unwrap, wrap } from "./wrap.ts";

/** The entry a share is for; the EK stays the same across its versions within an epoch (P-09) */
export type SharePlace = { vaultId: Uint8Array; entryId: Uint8Array };

/** bindung(EK, "share", vault-ID, entry-ID), which the signed share carries */
export const shareKeyCommitment = (entryKey: Uint8Array, { vaultId, entryId }: SharePlace) =>
  keyCommitment(entryKey, "share", vaultId, entryId);

// The recipient in the context too: a package for one recipient cannot be handed to another
const recipientPlace = ({ vaultId, entryId }: SharePlace, recipientId: Uint8Array) => ({
  purpose: "share",
  context: [vaultId, entryId, recipientId],
});

export const wrapShareKey = (
  recipient: Recipient,
  recipientId: Uint8Array,
  entryKey: Uint8Array,
  at: SharePlace,
) => {
  if (entryKey.length !== 32) throw new RangeError("entry key must be 32 bytes");
  return wrap(recipient, entryKey, recipientPlace(at, recipientId));
};

export type ShareKeyError = "not-authentic" | "not-committed";

/** Unwraps EK and accepts it only if it is a 32-byte key that matches the signed binding */
export const unwrapShareKey = (
  me: { secretKey: Uint8Array; fingerprint: Uint8Array; accountId: Uint8Array },
  pkg: Uint8Array,
  at: SharePlace,
  signedCommitment: Uint8Array,
): Result<Uint8Array, ShareKeyError> => {
  const opened = unwrap(me.secretKey, me.fingerprint, pkg, recipientPlace(at, me.accountId));
  if (!opened.ok || opened.value.length !== 32) return err("not-authentic");
  if (!constantTimeEqual(shareKeyCommitment(opened.value, at), signedCommitment))
    return err("not-committed");
  return opened;
};
