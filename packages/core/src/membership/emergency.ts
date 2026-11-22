/**
 * Emergency access (K-307 part d, docs/sicherheitsdesign.md P-14), as the clients make and check
 * it. The grantor's client wraps the keys to the grantee's certified bundle and signs the grant
 * (F-09); the short statements around it (request, objection, early approval, revocation) are
 * signed by whoever makes them. Like Bitwarden's Emergency Access, with "view" (chosen vaults) or
 * "full" (the account), but every key is checked against what the grantor signed, never the server.
 */
import {
  constantTimeEqual,
  EMERGENCY_PURPOSE,
  type EmergencyParties,
  type EmergencyStatement,
  type EmergencyTerms,
  emergencyAccountCommitment,
  emergencyGrantDigest,
  emergencyGrantMessage,
  emergencyStatementMessage,
  sign,
  vaultKeyCommitment,
  verify,
  wrapEmergencyAccountKey,
  wrapEmergencyVaultKey,
} from "@kennwort/crypto";
import type { EmergencySeen } from "../account/emergency-seen.ts";
import { isReplayed } from "../account/emergency-seen.ts";
import { err, ok, type Result } from "../result.ts";
import type { Author } from "../sync/record.ts";
import { type Certificate, certificateFingerprint } from "./certificate.ts";
import type { EmergencyGrant, EmergencyPackages, Statement } from "./emergency-wire.ts";
import { MAX_WAIT_SECONDS, MIN_WAIT_SECONDS } from "./emergency-wire.ts";
import type { Keyring } from "./vault-ops.ts";
import { certificateOf, type Trust } from "./verify-log.ts";

type Unsigned = Omit<EmergencyGrant, "signature">;

/** What F-09 signs, from a grant */
const termsOf = (g: Unsigned): EmergencyTerms => ({
  companyId: g.companyId,
  grantorId: g.grantor,
  granteeId: g.grantee,
  granteeFingerprint: g.granteeFingerprint,
  scope: g.scope,
  waitSeconds: g.waitSeconds,
  time: g.time,
  accountCommitment: g.accountCommitment ?? new Uint8Array(),
  items: g.items,
});

export const partiesOf = (g: { grantor: Uint8Array; grantee: Uint8Array }): EmergencyParties => ({
  grantorId: g.grantor,
  granteeId: g.grantee,
});

/** View access: the current key of each chosen vault; full access: the grantor's AK */
export type GrantKeys =
  | { scope: "view"; rings: readonly Keyring[] }
  | { scope: "full"; accountKey: Uint8Array };

type Recipient = { publicKey: Uint8Array; fingerprint: Uint8Array };
type Parties = { grantorId: Uint8Array; granteeId: Uint8Array };

/** What each scope adds to a grant: the commitments it signs and the packages that go with it */
const scoped = (keys: GrantKeys, to: Recipient, parties: Parties) => {
  if (keys.scope === "view")
    return {
      signed: {
        items: keys.rings.map((ring) => ({
          vaultId: ring.vaultId,
          epoch: ring.epoch,
          commitment: vaultKeyCommitment(ring.vaultKey, ring),
        })),
      },
      packages: {
        vaults: keys.rings.map((ring) => ({
          vaultId: ring.vaultId,
          epoch: ring.epoch,
          wrapped: wrapEmergencyVaultKey(to, ring.vaultKey, { ...ring, ...parties }),
        })),
      },
    };
  return {
    signed: {
      accountCommitment: emergencyAccountCommitment(keys.accountKey, parties.grantorId),
      items: [],
    },
    packages: { vaults: [], account: wrapEmergencyAccountKey(to, keys.accountKey, parties) },
  };
};

/**
 * A grant to the owner of a certificate the caller has checked (E-05), with the waiting time the
 * grantor chose; the packages go to the server with it, which keeps them back until it is over
 */
export const makeGrant = (
  author: Author,
  grantee: Certificate,
  keys: GrantKeys,
  { waitSeconds, time }: { waitSeconds: number; time: number },
): { grant: EmergencyGrant; packages: EmergencyPackages } => {
  if (waitSeconds < MIN_WAIT_SECONDS || waitSeconds > MAX_WAIT_SECONDS)
    throw new RangeError("waiting time out of range");
  const parties = { grantorId: author.id, granteeId: grantee.accountId };
  const to = { publicKey: grantee.xwingPublicKey, fingerprint: certificateFingerprint(grantee) };
  const { signed, packages } = scoped(keys, to, parties);
  const unsigned: Unsigned = {
    companyId: grantee.companyId,
    grantor: author.id,
    grantee: grantee.accountId,
    granteeFingerprint: to.fingerprint,
    scope: keys.scope,
    waitSeconds,
    time,
    ...signed,
  };
  const message = emergencyGrantMessage(termsOf(unsigned));
  return {
    grant: { ...unsigned, signature: sign(author.edSecretKey, EMERGENCY_PURPOSE, message) },
    packages,
  };
};

/** Whether this Ed25519 key signed exactly this grant; the server checks this much as well */
export const isSignedGrant = (edPublicKey: Uint8Array, grant: EmergencyGrant) =>
  verify(edPublicKey, grant.signature, EMERGENCY_PURPOSE, emergencyGrantMessage(termsOf(grant)));

export type GrantError = "not-for-me" | "uncertified-grantor" | "bad-signature" | "replayed";

/**
 * The grantee's check of a grant the server lists: for this account and the very bundle it has,
 * signed by a grantor the pinned root certified in the same company, and no older than the newest
 * grant from that grantor this account has seen, nor that one once revoked. Gives the grantor's
 * certificate.
 */
export const checkGrant = (
  grant: EmergencyGrant,
  me: Certificate,
  trust: Trust,
  seen: EmergencySeen | undefined,
): Result<Certificate, GrantError> => {
  const forMe =
    constantTimeEqual(grant.grantee, me.accountId) &&
    constantTimeEqual(grant.granteeFingerprint, certificateFingerprint(me));
  if (!forMe) return err("not-for-me");
  const grantor = certificateOf(trust, grant.grantor);
  if (!grantor || !constantTimeEqual(grantor.companyId, grant.companyId))
    return err("uncertified-grantor");
  if (!isSignedGrant(grantor.edPublicKey, grant)) return err("bad-signature");
  return isReplayed(seen, grant.time) ? err("replayed") : ok(grantor);
};

/** The exact grant a statement names: its signed time and the digest of what the grantor signed */
export const grantRef = (grant: Unsigned) => ({
  time: grant.time,
  digest: emergencyGrantDigest(termsOf(grant)),
});

/** A request, objection, approval or revocation for exactly this grant */
export const signStatement = (
  kind: EmergencyStatement,
  edSecretKey: Uint8Array,
  grant: Unsigned,
  at: number,
): Statement => {
  const ref = grantRef(grant);
  return {
    grantor: grant.grantor,
    grantee: grant.grantee,
    grantTime: ref.time,
    grantDigest: ref.digest,
    at,
    signature: sign(
      edSecretKey,
      kind,
      emergencyStatementMessage(grant.companyId, partiesOf(grant), ref, at),
    ),
  };
};

/**
 * Whether this key signed the statement as this kind, about the grant the statement itself names:
 * enough to learn of a revocation whose grant is gone, never to use one against a grant
 */
export const isSignedStatementOf = (
  kind: EmergencyStatement,
  edPublicKey: Uint8Array,
  companyId: Uint8Array,
  statement: Statement,
) =>
  verify(
    edPublicKey,
    statement.signature,
    kind,
    emergencyStatementMessage(
      companyId,
      partiesOf(statement),
      { time: statement.grantTime, digest: statement.grantDigest },
      statement.at,
    ),
  );

/** Whether the statement names exactly this grant: its two accounts, its time and its digest */
export const namesGrant = (statement: Statement, grant: Unsigned) => {
  const ref = grantRef(grant);
  return (
    constantTimeEqual(statement.grantor, grant.grantor) &&
    constantTimeEqual(statement.grantee, grant.grantee) &&
    statement.grantTime === ref.time &&
    constantTimeEqual(statement.grantDigest, ref.digest)
  );
};

/** Whether the statement is of this kind, about exactly this grant, signed by this key */
export const isSignedStatement = (
  kind: EmergencyStatement,
  edPublicKey: Uint8Array,
  grant: Unsigned,
  statement: Statement,
) =>
  namesGrant(statement, grant) &&
  isSignedStatementOf(kind, edPublicKey, grant.companyId, statement);

/**
 * After a key rotation (P-11) the grantor's client renews a view grant: true when the grantor now
 * holds a newer key for one of its vaults than the grant carries
 */
export const isBehind = (grant: EmergencyGrant, rings: readonly Keyring[]) =>
  grant.items.some((item) =>
    rings.some((ring) => constantTimeEqual(ring.vaultId, item.vaultId) && ring.epoch > item.epoch),
  );
