/**
 * Company recovery, step by step (K-307 part c, P-13), as pure functions:
 *
 * - depositFor: what an account does with its deposit under the policy in force. It deposits only
 *   to the key whose fingerprint the root-signed policy names, never to one the server merely
 *   serves (escrow to a key the policy does not name never comes into being).
 * - approveRecovery: the owner's checks before it uses a deposited AK, then the package for the
 *   employee's new device, carrying the hash of the employee's sealed state.
 * - checkRecovered: the new device's check that the AK it got opens an account the root certified.
 */
import {
  constantTimeEqual,
  type Deposit,
  depositAccountKey,
  holdsAccountKey,
  type KeyBlock,
  type RecoverError,
  recoverAccountKey,
  recoveryFingerprint,
  rootFingerprint,
} from "@kennwort/crypto";
import { sealRecoveryPackage, stateHash } from "../account/pairing.ts";
import { openState } from "../account/state.ts";
import { err, ok, type Result } from "../result.ts";
import { type Certificate, isCertified } from "./certificate.ts";
import type { UnsignedPolicy } from "./policy.ts";
import type { CompanyRecoveryKey } from "./recovery-key.ts";

export type DepositDecision =
  /** The policy has company recovery off: nothing to deposit */
  | { kind: "off" }
  /** The server serves no key, or one the policy does not name: never deposit to it */
  | { kind: "other-key" }
  /** The server holds this account's deposit for the key in force */
  | { kind: "kept" }
  | { kind: "deposit"; deposit: Deposit };

export type Depositor = {
  accountKey: Uint8Array;
  accountId: Uint8Array;
  keyBlock: KeyBlock;
};

export const depositFor = (
  policy: UnsignedPolicy,
  servedKey: Uint8Array | null,
  held: Deposit | undefined,
  account: Depositor,
): DepositDecision => {
  const recovery = policy.companyRecovery;
  if (!recovery.enabled) return { kind: "off" };
  const { fingerprint } = recovery;
  if (!servedKey || !constantTimeEqual(recoveryFingerprint(servedKey), fingerprint))
    return { kind: "other-key" };
  const place = { companyId: policy.companyId, accountId: account.accountId };
  const { ed } = account.keyBlock;
  if (held && holdsAccountKey(held, account.accountKey, ed.publicKey, place, fingerprint))
    return { kind: "kept" };
  const to = { publicKey: servedKey, fingerprint };
  return {
    kind: "deposit",
    deposit: depositAccountKey(to, account.accountKey, place, ed.secretKey),
  };
};

/** What the server holds for an employee: the deposit and the sealed key block and state */
export type RecoveryBundle = {
  deposit: Deposit;
  keyBlock: Uint8Array;
  state: Uint8Array;
  stateCounter: number;
};

export type ApproveInput = {
  recoveryKey: CompanyRecoveryKey;
  bundle: RecoveryBundle;
  /** The employee's certificate as the owner's client checked it under the pinned root */
  certificate: Certificate;
  /** The owner's pinned root fingerprint */
  rootFingerprint: Uint8Array;
  /** The new device's one-time key and the pairing secret from its QR code (P-04) */
  device: { publicKey: Uint8Array; pairingSecret: Uint8Array };
};

export type ApproveError = RecoverError | "damaged-state";

export const approveRecovery = (input: ApproveInput): Result<Uint8Array, ApproveError> => {
  const { bundle, certificate } = input;
  const accountKey = recoverAccountKey({
    companyRecovery: input.recoveryKey,
    deposit: bundle.deposit,
    place: { companyId: certificate.companyId, accountId: certificate.accountId },
    certified: certificate,
    sealedKeyBlock: bundle.keyBlock,
    rootFingerprint: input.rootFingerprint,
  });
  if (!accountKey.ok) return accountKey;
  const state = openState(
    accountKey.value,
    certificate.accountId,
    bundle.stateCounter,
    bundle.state,
  );
  if (!state.ok) return err("damaged-state");
  return ok(
    sealRecoveryPackage(input.device.publicKey, input.device.pairingSecret, {
      accountKey: accountKey.value,
      accountId: certificate.accountId,
      stateHash: stateHash(bundle.state),
    }),
  );
};

export type RecoveredError = "root-mismatch" | "uncertified";

/**
 * The new device knows nothing of its own but what AK opens: the key block names the root, and the
 * account counts as its own only if the company's root (as the server serves it) has that
 * fingerprint and certified exactly the key block's keys for this account
 */
export const checkRecovered = (
  keyBlock: KeyBlock,
  accountId: Uint8Array,
  rootPublicKey: Uint8Array | null,
  certificate: Certificate | null,
): Result<true, RecoveredError> => {
  if (
    !rootPublicKey ||
    !constantTimeEqual(rootFingerprint(rootPublicKey), keyBlock.rootFingerprint)
  )
    return err("root-mismatch");
  const matches =
    certificate !== null &&
    isCertified(rootPublicKey, certificate) &&
    constantTimeEqual(certificate.accountId, accountId) &&
    constantTimeEqual(certificate.xwingPublicKey, keyBlock.xwing.publicKey) &&
    constantTimeEqual(certificate.edPublicKey, keyBlock.ed.publicKey);
  return matches ? ok(true) : err("uncertified");
};
