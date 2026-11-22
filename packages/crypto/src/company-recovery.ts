/**
 * Company recovery of docs/sicherheitsdesign.md (P-13, F-08): the employee's client deposits AK
 * wrapped to the company recovery key and signs the deposit; the owner's client uses a deposited AK
 * only after checking signature, commitment, the key block it opens and the root fingerprint in it.
 *
 * Like Bitwarden's "account recovery" (the user key wrapped to the organization's public key) and
 * Passbolt's account recovery, the escrow is a public-key wrap made on the employee's device; unlike
 * them, F-02 does not say who wrapped, so the deposit carries the employee's signature over the
 * company, the account, the recovery key's fingerprint, the commitment to AK and the package itself
 * (F-08 v1). A deposit the server made, or one for an earlier recovery key, does not verify.
 *
 *   package    = F-02(recovery key, AK, purpose "company", context account)
 *   commitment = commitment(AK, "company", account)
 *   signature  = F-03(employee, "company-deposit",
 *                     enc("kennwort/deposit/v1", company, account, fp(recovery key), commitment, package))
 */

import { type KeyBlock, openKeyBlock } from "./account.ts";
import { constantTimeEqual, keyCommitment } from "./commitment.ts";
import { encode } from "./encoding.ts";
import { bundleFingerprint, recoveryFingerprint } from "./fingerprint.ts";
import { err, ok, type Result } from "./result.ts";
import { sign, verify } from "./sign.ts";
import { type Recipient, unwrap, wrap } from "./wrap.ts";

export type Deposit = { pkg: Uint8Array; commitment: Uint8Array; signature: Uint8Array };
/** Whose AK the deposit holds: the company and the account, both as their 16 bytes */
export type DepositPlace = { companyId: Uint8Array; accountId: Uint8Array };

export const DEPOSIT_PURPOSE = "company-deposit";

const wrapPlace = (accountId: Uint8Array) => ({ purpose: "company", context: [accountId] });

/** The commitment to AK the deposit's signature names */
export const depositCommitment = (accountKey: Uint8Array, accountId: Uint8Array) =>
  keyCommitment(accountKey, "company", accountId);

/** What the employee signs (F-08 v1): one field, so its version label comes first */
export const depositMessage = (
  place: DepositPlace,
  recoveryFp: Uint8Array,
  commitment: Uint8Array,
  pkg: Uint8Array,
) => encode("kennwort/deposit/v1", place.companyId, place.accountId, recoveryFp, commitment, pkg);

/**
 * Deposits AK for company recovery. The public key comes from the server, the fingerprint from the
 * policy the root signed; the deposit happens only if they match, or the server would read AK.
 */
export const depositAccountKey = (
  companyRecovery: Recipient,
  accountKey: Uint8Array,
  place: DepositPlace,
  employeeEdSecretKey: Uint8Array,
): Deposit => {
  if (
    !constantTimeEqual(recoveryFingerprint(companyRecovery.publicKey), companyRecovery.fingerprint)
  )
    throw new RangeError("recovery key does not match the policy's fingerprint");
  if (accountKey.length !== 32) throw new RangeError("account key must be 32 bytes");
  const commitment = depositCommitment(accountKey, place.accountId);
  const pkg = wrap(companyRecovery, accountKey, wrapPlace(place.accountId));
  const message = depositMessage(place, companyRecovery.fingerprint, commitment, pkg);
  return { pkg, commitment, signature: sign(employeeEdSecretKey, DEPOSIT_PURPOSE, message) };
};

/** True when the employee's key signed exactly this deposit for this recovery key */
export const isSignedDeposit = (
  edPublicKey: Uint8Array,
  deposit: Deposit,
  place: DepositPlace,
  recoveryFp: Uint8Array,
) =>
  verify(
    edPublicKey,
    deposit.signature,
    DEPOSIT_PURPOSE,
    depositMessage(place, recoveryFp, deposit.commitment, deposit.pkg),
  );

/**
 * The employee's own check of the deposit the server holds: signed by this account for the
 * recovery key in force and committing to this AK. An older deposit, one for another key or one the
 * server made up fails, and the client deposits anew.
 */
export const holdsAccountKey = (
  deposit: Deposit,
  accountKey: Uint8Array,
  edPublicKey: Uint8Array,
  place: DepositPlace,
  recoveryFp: Uint8Array,
) =>
  isSignedDeposit(edPublicKey, deposit, place, recoveryFp) &&
  constantTimeEqual(depositCommitment(accountKey, place.accountId), deposit.commitment);

export type RecoverError =
  | "not-signed"
  | "not-authentic"
  | "not-committed"
  | "wrong-key-block"
  | "wrong-root";

/** An account's bundle as the company root certified it */
export type Certified = { xwingPublicKey: Uint8Array; edPublicKey: Uint8Array };

export type RecoverInput = {
  companyRecovery: { secretKey: Uint8Array; fingerprint: Uint8Array };
  deposit: Deposit;
  place: DepositPlace;
  /** The employee's bundle as the company root certified it */
  certified: Certified;
  sealedKeyBlock: Uint8Array;
  /** The owner's own pinned root fingerprint */
  rootFingerprint: Uint8Array;
};

/** The key block holds exactly the certified bundle (also for emergency access, P-14) */
export const matchesBundle = (block: KeyBlock, certified: Certified) =>
  constantTimeEqual(
    bundleFingerprint(block.xwing.publicKey, block.ed.publicKey),
    bundleFingerprint(certified.xwingPublicKey, certified.edPublicKey),
  );

export const recoverAccountKey = (input: RecoverInput): Result<Uint8Array, RecoverError> => {
  const { deposit, place, certified } = input;
  const { secretKey, fingerprint } = input.companyRecovery;
  if (!isSignedDeposit(certified.edPublicKey, deposit, place, fingerprint))
    return err("not-signed");
  const accountKey = unwrap(secretKey, fingerprint, deposit.pkg, wrapPlace(place.accountId));
  if (!accountKey.ok) return err("not-authentic");
  if (!constantTimeEqual(depositCommitment(accountKey.value, place.accountId), deposit.commitment))
    return err("not-committed");
  const block = openKeyBlock(accountKey.value, place.accountId, input.sealedKeyBlock);
  if (!block.ok || !matchesBundle(block.value, certified)) return err("wrong-key-block");
  if (!constantTimeEqual(block.value.rootFingerprint, input.rootFingerprint))
    return err("wrong-root");
  return ok(accountKey.value);
};
