/**
 * New unlock ways after the Recovery Key was used (P-12): who forgot the passphrase chooses a new
 * one and gets a new Recovery Key; the old one no longer signs in. AK stays, so nothing else is
 * sealed anew; only the boxes of AK, the account salt and both sign-in keys change. That is also
 * the limit: whoever kept the old recovery box opens AK with the old key still, until AK itself is
 * rotated. `upload` is what the server gets, signed by the old Recovery Key's sign-in key, so a
 * session alone cannot replace the unlock ways; passphrase, Secret Key and the new Recovery Key
 * stay with the caller. After company recovery (P-13) the account's own Ed25519 key signs instead.
 */
import {
  ACCOUNT_SALT_LENGTH,
  ed25519KeyPair,
  newRecoveryKey,
  type Part,
  passphraseKeys,
  randomBytes,
  recoveryLoginSeed,
  sealAccountKey,
  sign,
} from "@kennwort/crypto";
import { encodeBytes } from "../sync/bytes.ts";

export type UnlockUpload = {
  accountSalt: Uint8Array;
  loginPublicKey: Uint8Array;
  recoveryLoginPublicKey: Uint8Array;
  unlock: { passphrase: Uint8Array; recovery: Uint8Array };
  /** Signature by the spent Recovery Key's sign-in key over all of the above (F-03) */
  proof: Uint8Array;
};

export const RENEWAL_PURPOSE = "unlock-renewal";

/** What the proof signs: the account (its text, as the server keeps it) and every new value */
export const renewalFields = (
  accountIdText: string,
  upload: Omit<UnlockUpload, "proof">,
): Part[] => [
  accountIdText,
  upload.accountSalt,
  upload.loginPublicKey,
  upload.recoveryLoginPublicKey,
  upload.unlock.passphrase,
  upload.unlock.recovery,
];

export type RenewDeps = {
  derive?: typeof passphraseKeys;
  random?: (length: number) => Uint8Array;
  newRecovery?: () => Uint8Array;
};

/** The new salt, sign-in keys and boxes of AK for a new passphrase and a new Recovery Key */
const newUnlockWays = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  deps: RenewDeps,
) => {
  const accountSalt = (deps.random ?? randomBytes)(ACCOUNT_SALT_LENGTH);
  const recoveryKey = (deps.newRecovery ?? newRecoveryKey)();
  const derived = (deps.derive ?? passphraseKeys)(passphrase, accountSalt, secretKey, accountId);
  const upload = {
    accountSalt,
    loginPublicKey: ed25519KeyPair(derived.login).publicKey,
    recoveryLoginPublicKey: ed25519KeyPair(recoveryLoginSeed(recoveryKey, accountId)).publicKey,
    unlock: {
      passphrase: sealAccountKey(derived.unlock, accountKey, accountId, { kind: "passphrase" }),
      recovery: sealAccountKey(recoveryKey, accountKey, accountId, { kind: "recovery" }),
    },
  };
  return { recoveryKey, upload, fields: renewalFields(encodeBytes(accountId), upload) };
};

export const renewUnlock = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  spentRecoveryKey: Uint8Array,
  deps: RenewDeps = {},
): { recoveryKey: Uint8Array; upload: UnlockUpload } => {
  const { recoveryKey, upload, fields } = newUnlockWays(
    accountKey,
    accountId,
    passphrase,
    secretKey,
    deps,
  );
  const spentLogin = ed25519KeyPair(recoveryLoginSeed(spentRecoveryKey, accountId));
  return {
    recoveryKey,
    upload: { ...upload, proof: sign(spentLogin.secretKey, RENEWAL_PURPOSE, ...fields) },
  };
};

/**
 * After company recovery (P-13) neither passphrase nor Recovery Key is at hand: the proof is the
 * account's own Ed25519 key from the key block, which only AK opens and whose public half the
 * server holds with the account's bundle. Its own purpose keeps it apart from the other proof.
 */
export const ACCOUNT_RENEWAL_PURPOSE = "unlock-renewal-account";

export const renewUnlockWithAccountKey = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  edSecretKey: Uint8Array,
  deps: RenewDeps = {},
): { recoveryKey: Uint8Array; upload: UnlockUpload } => {
  const { recoveryKey, upload, fields } = newUnlockWays(
    accountKey,
    accountId,
    passphrase,
    secretKey,
    deps,
  );
  return {
    recoveryKey,
    upload: { ...upload, proof: sign(edSecretKey, ACCOUNT_RENEWAL_PURPOSE, ...fields) },
  };
};
