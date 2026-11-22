/**
 * The grantee's side of emergency access once the server releases the packages (K-307 part d,
 * P-14): the release must answer this account's own signed request, after the waiting time by the
 * grantee's own clock or with the grantor's signed early approval, and never a request the grantor
 * objected to. Then each vault key must match both the grant's commitment and the commitment the
 * vault's signed log holds for that epoch; AK must open the grantor's certified key block.
 */
import {
  constantTimeEqual,
  type EmergencyKeyError,
  type EmergencyReader,
  type KeyBlock,
  type TakeOverError,
  unwrapEmergencyAccountKey,
  unwrapEmergencyVaultKey,
} from "@kennwort/crypto";
import type { EmergencySeen } from "../account/emergency-seen.ts";
import { err, ok, type Result } from "../result.ts";
import type { Certificate } from "./certificate.ts";
import { isSignedStatement, partiesOf } from "./emergency.ts";
import type { EmergencyGrant, EmergencyPackages, Release } from "./emergency-wire.ts";
import type { Keyring } from "./vault-ops.ts";
import type { LogState } from "./verify-log.ts";

export type ReleaseError = "not-my-request" | "objected" | "waiting";

/**
 * Whether these packages may be used now (seconds): the request is the grantee's own, the grantor
 * has not objected to it as far as this account has seen, and the waiting time is over or the
 * grantor approved early. A server that lets the packages out early or after an objection is
 * refused here; one that hides the objection and shortens the wait is the residual risk of P-14.
 */
export const checkRelease = (
  grant: EmergencyGrant,
  release: Pick<Release, "request" | "approval">,
  parties: { grantor: Certificate; me: Certificate },
  seen: EmergencySeen | undefined,
  now: number,
): Result<true, ReleaseError> => {
  const { request, approval } = release;
  if (!isSignedStatement("emergency-request", parties.me.edPublicKey, grant, request))
    return err("not-my-request");
  if (request.at <= (seen?.objected ?? 0)) return err("objected");
  const approved =
    approval !== null &&
    approval.at === request.at &&
    isSignedStatement("emergency-approval", parties.grantor.edPublicKey, grant, approval);
  if (!approved && now < request.at + grant.waitSeconds) return err("waiting");
  return ok(true);
};

export type EmergencyVaultError = "no-package" | "not-in-log" | EmergencyKeyError;

/**
 * The key of one vault of a view grant: the package for the epoch the grant names, committed as the
 * grant says and as the vault's checked log says for that epoch. A grantor can so pass on only
 * keys it really holds; a key the server wrapped or swapped matches neither.
 */
export const openEmergencyVault = (
  grant: EmergencyGrant,
  packages: EmergencyPackages,
  reader: EmergencyReader,
  vaultId: Uint8Array,
  log: LogState,
): Result<Keyring, EmergencyVaultError> => {
  const item = grant.items.find((i) => constantTimeEqual(i.vaultId, vaultId));
  const pkg = packages.vaults.find(
    (p) => constantTimeEqual(p.vaultId, vaultId) && p.epoch === item?.epoch,
  );
  if (!item || !pkg) return err("no-package");
  const logged = log.commitments.get(item.epoch);
  if (!logged || !constantTimeEqual(logged, item.commitment)) return err("not-in-log");
  const place = { vaultId, epoch: item.epoch, ...partiesOf(grant) };
  const vaultKey = unwrapEmergencyVaultKey(reader, pkg.wrapped, place, item.commitment);
  return vaultKey.ok ? ok({ vaultId, epoch: item.epoch, vaultKey: vaultKey.value }) : vaultKey;
};

export type EmergencyAccountError = "no-package" | TakeOverError;

/** The grantor's AK and key block for a full grant, as unwrapEmergencyAccountKey checks them */
export const openEmergencyAccount = (
  grant: EmergencyGrant,
  packages: EmergencyPackages,
  reader: EmergencyReader,
  found: { grantor: Certificate; sealedKeyBlock: Uint8Array; rootFingerprint: Uint8Array },
): Result<{ accountKey: Uint8Array; keyBlock: KeyBlock }, EmergencyAccountError> => {
  if (!packages.account || !grant.accountCommitment) return err("no-package");
  return unwrapEmergencyAccountKey({
    me: reader,
    pkg: packages.account,
    parties: partiesOf(grant),
    signedCommitment: grant.accountCommitment,
    certified: found.grantor,
    sealedKeyBlock: found.sealedKeyBlock,
    rootFingerprint: found.rootFingerprint,
  });
};
