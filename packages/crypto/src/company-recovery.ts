/**
 * Company recovery of docs/sicherheitsdesign.md (P-13): the employee's client deposits AK wrapped to
 * the company recovery key and signs the deposit; the owner's client uses a deposited AK only after
 * checking signature, commitment, the key block it opens and the root fingerprint in it.
 */

import { type KeyBlock, openKeyBlock } from "./account.ts";
import { constantTimeEqual, keyCommitment } from "./commitment.ts";
import { bundleFingerprint } from "./fingerprint.ts";
import { err, ok, type Result } from "./result.ts";
import { sign, verify } from "./sign.ts";
import { type Recipient, unwrap, wrap } from "./wrap.ts";

export type Deposit = { pkg: Uint8Array; commitment: Uint8Array; signature: Uint8Array };

const place = (accountId: Uint8Array) => ({ purpose: "company", context: [accountId] });

export const depositAccountKey = (
  companyRecovery: Recipient,
  accountKey: Uint8Array,
  accountId: Uint8Array,
  employeeEdSecretKey: Uint8Array,
): Deposit => {
  const commitment = keyCommitment(accountKey, "company", accountId);
  return {
    pkg: wrap(companyRecovery, accountKey, place(accountId)),
    commitment,
    signature: sign(employeeEdSecretKey, "company-recovery", accountId, commitment),
  };
};

export type RecoverError =
  | "not-signed"
  | "not-authentic"
  | "not-committed"
  | "wrong-key-block"
  | "wrong-root";

export type RecoverInput = {
  companyRecovery: { secretKey: Uint8Array; fingerprint: Uint8Array };
  deposit: Deposit;
  accountId: Uint8Array;
  /** The employee's bundle as the company root certified it */
  certified: { xwingPublicKey: Uint8Array; edPublicKey: Uint8Array };
  sealedKeyBlock: Uint8Array;
  /** The owner's own pinned root fingerprint */
  rootFingerprint: Uint8Array;
};

const matchesBundle = (block: KeyBlock, certified: RecoverInput["certified"]) =>
  constantTimeEqual(
    bundleFingerprint(block.xwing.publicKey, block.ed.publicKey),
    bundleFingerprint(certified.xwingPublicKey, certified.edPublicKey),
  );

export const recoverAccountKey = (input: RecoverInput): Result<Uint8Array, RecoverError> => {
  const { deposit, accountId, certified } = input;
  if (
    !verify(
      certified.edPublicKey,
      deposit.signature,
      "company-recovery",
      accountId,
      deposit.commitment,
    )
  )
    return err("not-signed");
  const { secretKey, fingerprint } = input.companyRecovery;
  const accountKey = unwrap(secretKey, fingerprint, deposit.pkg, place(accountId));
  if (!accountKey.ok) return err("not-authentic");
  if (!constantTimeEqual(keyCommitment(accountKey.value, "company", accountId), deposit.commitment))
    return err("not-committed");
  const block = openKeyBlock(accountKey.value, accountId, input.sealedKeyBlock);
  if (!block.ok || !matchesBundle(block.value, certified)) return err("wrong-key-block");
  if (!constantTimeEqual(block.value.rootFingerprint, input.rootFingerprint))
    return err("wrong-root");
  return ok(accountKey.value);
};
