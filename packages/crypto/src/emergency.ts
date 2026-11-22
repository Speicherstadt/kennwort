/**
 * Emergency access of docs/sicherheitsdesign.md (P-14, F-09): the grantor's client wraps the keys a
 * trusted colleague may have in an emergency to that colleague's certified bundle and signs the
 * grant with the waiting time and a commitment to every key; the server hands the packages out only
 * after the waiting time, and the grantee's client takes a key only against the signed commitment.
 *
 * Modelled on Bitwarden's "Emergency Access" (a trusted contact, a wait time the grantor can
 * object within, "view" or "takeover") and 1Password's emergency kit; the wrapping is F-02, X-Wing
 * as the KEM in the manner of RFC 9180's base mode, bound to the recipient. Unlike Bitwarden the
 * server cannot hand out a key of its own: F-02 says nothing about who wrapped, so every key must
 * match a commitment the grantor signed (E-16).
 *
 *   view:  package    = F-02(grantee, VKₑ, purpose "emergency", vault, epoch, grantor, grantee)
 *          commitment = commitment(VKₑ, "vault-key", vault, epoch)       (the one the log signs)
 *   full:  package    = F-02(grantee, AK, purpose "emergency-account", grantor, grantee)
 *          commitment = commitment(AK, "emergency-account", grantor)
 *   grant = enc("kennwort/emergency/v1", company, grantor, grantee, fp(grantee), scope, wait,
 *               time, account commitment or empty, enc(enc(vault, epoch, commitment)…))
 *   statement = enc("kennwort/emergency-statement/v1", company, grantor, grantee, grant's time,
 *                   SHA-512/256(grant), at)
 */
import { sha512_256 } from "@noble/hashes/sha2.js";
import { type KeyBlock, openKeyBlock } from "./account.ts";
import { constantTimeEqual, keyCommitment } from "./commitment.ts";
import { type Certified, matchesBundle } from "./company-recovery.ts";
import { encode } from "./encoding.ts";
import { err, ok, type Result } from "./result.ts";
import { type VaultPlace, vaultKeyCommitment } from "./vault.ts";
import { type Recipient, unwrap, wrap } from "./wrap.ts";

/** Who gives and who may receive, both as their 16-byte account IDs */
export type EmergencyParties = { grantorId: Uint8Array; granteeId: Uint8Array };
export type EmergencyVaultPlace = VaultPlace & EmergencyParties;
/** The grantee's own keys: the X-Wing secret key and its bundle's fingerprint */
export type EmergencyReader = { secretKey: Uint8Array; fingerprint: Uint8Array };

export const EMERGENCY_PURPOSE = "emergency";
export type EmergencyKeyError = "not-authentic" | "not-committed";

const assertKey = (key: Uint8Array) => {
  if (key.length !== 32) throw new RangeError("key must be 32 bytes");
};

// Grantor and grantee in the context: a package for one pair cannot be handed to another
const vaultWrapPlace = (at: EmergencyVaultPlace) => ({
  purpose: EMERGENCY_PURPOSE,
  context: [at.vaultId, at.epoch, at.grantorId, at.granteeId],
});

const accountWrapPlace = (parties: EmergencyParties) => ({
  purpose: "emergency-account",
  context: [parties.grantorId, parties.granteeId],
});

export const wrapEmergencyVaultKey = (
  grantee: Recipient,
  vaultKey: Uint8Array,
  at: EmergencyVaultPlace,
) => {
  assertKey(vaultKey);
  return wrap(grantee, vaultKey, vaultWrapPlace(at));
};

/** Takes the opened payload only as a 32-byte key with exactly this commitment */
const committed = (
  opened: Result<Uint8Array, string>,
  commitmentOf: (key: Uint8Array) => Uint8Array,
  signedCommitment: Uint8Array,
): Result<Uint8Array, EmergencyKeyError> => {
  if (!opened.ok || opened.value.length !== 32) return err("not-authentic");
  return constantTimeEqual(commitmentOf(opened.value), signedCommitment)
    ? ok(opened.value)
    : err("not-committed");
};

/** VKₑ, only if it matches the signed commitment, which is the commitment of the vault's log */
export const unwrapEmergencyVaultKey = (
  me: EmergencyReader,
  pkg: Uint8Array,
  at: EmergencyVaultPlace,
  signedCommitment: Uint8Array,
): Result<Uint8Array, EmergencyKeyError> =>
  committed(
    unwrap(me.secretKey, me.fingerprint, pkg, vaultWrapPlace(at)),
    (key) => vaultKeyCommitment(key, at),
    signedCommitment,
  );

/** The commitment to the grantor's AK that a grant of full access carries */
export const emergencyAccountCommitment = (accountKey: Uint8Array, grantorId: Uint8Array) =>
  keyCommitment(accountKey, "emergency-account", grantorId);

export const wrapEmergencyAccountKey = (
  grantee: Recipient,
  accountKey: Uint8Array,
  parties: EmergencyParties,
) => {
  assertKey(accountKey);
  return wrap(grantee, accountKey, accountWrapPlace(parties));
};

export type TakeOverInput = {
  me: EmergencyReader;
  pkg: Uint8Array;
  parties: EmergencyParties;
  signedCommitment: Uint8Array;
  /** The grantor's bundle as the company root certified it */
  certified: Certified;
  sealedKeyBlock: Uint8Array;
  /** The grantee's own pinned root fingerprint */
  rootFingerprint: Uint8Array;
};
export type TakeOverError = EmergencyKeyError | "wrong-key-block" | "wrong-root";

/**
 * The grantor's AK for full access: committed as the grant says, opening the grantor's key block,
 * whose keys are the certified ones and whose root is the grantee's own (as P-13 checks a deposit)
 */
export const unwrapEmergencyAccountKey = (
  input: TakeOverInput,
): Result<{ accountKey: Uint8Array; keyBlock: KeyBlock }, TakeOverError> => {
  const { me, parties } = input;
  const accountKey = committed(
    unwrap(me.secretKey, me.fingerprint, input.pkg, accountWrapPlace(parties)),
    (key) => emergencyAccountCommitment(key, parties.grantorId),
    input.signedCommitment,
  );
  if (!accountKey.ok) return accountKey;
  const block = openKeyBlock(accountKey.value, parties.grantorId, input.sealedKeyBlock);
  if (!block.ok || !matchesBundle(block.value, input.certified)) return err("wrong-key-block");
  if (!constantTimeEqual(block.value.rootFingerprint, input.rootFingerprint))
    return err("wrong-root");
  return ok({ accountKey: accountKey.value, keyBlock: block.value });
};

export type EmergencyScope = "view" | "full";
export type EmergencyItem = { vaultId: Uint8Array; epoch: number; commitment: Uint8Array };
/** Everything a grant says, as F-09 v1 signs it */
export type EmergencyTerms = EmergencyParties & {
  companyId: Uint8Array;
  granteeFingerprint: Uint8Array;
  scope: EmergencyScope;
  waitSeconds: number;
  time: number;
  /** The commitment to AK for full access; empty for view access */
  accountCommitment: Uint8Array;
  /** Vault, epoch and commitment of each vault key for view access; none for full access */
  items: readonly EmergencyItem[];
};

/** What the grantor signs (F-09 v1): one field, so its version label comes first */
export const emergencyGrantMessage = (t: EmergencyTerms) =>
  encode(
    "kennwort/emergency/v1",
    t.companyId,
    t.grantorId,
    t.granteeId,
    t.granteeFingerprint,
    t.scope,
    t.waitSeconds,
    t.time,
    t.accountCommitment,
    encode(...t.items.map((item) => encode(item.vaultId, item.epoch, item.commitment))),
  );

/**
 * The digest of a grant: SHA-512/256 over the message the grantor signed. Its first part is the
 * grant's own label, so it never equals a fingerprint (F-04).
 */
export const emergencyGrantDigest = (t: EmergencyTerms) => sha512_256(emergencyGrantMessage(t));

/** The exact grant a statement is about: its signed time and its digest */
export type EmergencyGrantRef = { time: number; digest: Uint8Array };

/**
 * The short statements around a grant, each signed under its own purpose: the grantee's request,
 * the grantor's objection or early approval (all naming the request's time), the grantor's
 * revocation (naming the grant's time). Each names the exact grant it is about, so none can be
 * played back against another grant of the same two accounts (an approval of view access never
 * lets out a later grant of full access).
 */
export const EMERGENCY_STATEMENTS = [
  "emergency-request",
  "emergency-objection",
  "emergency-approval",
  "emergency-revocation",
] as const;
export type EmergencyStatement = (typeof EMERGENCY_STATEMENTS)[number];

export const emergencyStatementMessage = (
  companyId: Uint8Array,
  parties: EmergencyParties,
  grant: EmergencyGrantRef,
  at: number,
) =>
  encode(
    "kennwort/emergency-statement/v1",
    companyId,
    parties.grantorId,
    parties.granteeId,
    grant.time,
    grant.digest,
    at,
  );
