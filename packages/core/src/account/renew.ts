/**
 * New unlock ways after the Recovery Key was used (P-12): who forgot the passphrase chooses a new
 * one and gets a new Recovery Key, the old one is spent. AK stays, so nothing else is sealed anew;
 * only the boxes of AK, the account salt and both sign-in keys change. `upload` is what the server
 * gets; passphrase, Secret Key and the new Recovery Key stay with the caller.
 */
import {
  ACCOUNT_SALT_LENGTH,
  ed25519KeyPair,
  newRecoveryKey,
  passphraseKeys,
  randomBytes,
  recoveryLoginSeed,
  sealAccountKey,
} from "@kennwort/crypto";

export type UnlockUpload = {
  accountSalt: Uint8Array;
  loginPublicKey: Uint8Array;
  recoveryLoginPublicKey: Uint8Array;
  unlock: { passphrase: Uint8Array; recovery: Uint8Array };
};

export type RenewDeps = {
  derive?: typeof passphraseKeys;
  random?: (length: number) => Uint8Array;
  newRecovery?: () => Uint8Array;
};

export const renewUnlock = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  passphrase: string,
  secretKey: Uint8Array,
  deps: RenewDeps = {},
): { recoveryKey: Uint8Array; upload: UnlockUpload } => {
  const accountSalt = (deps.random ?? randomBytes)(ACCOUNT_SALT_LENGTH);
  const recoveryKey = (deps.newRecovery ?? newRecoveryKey)();
  const derived = (deps.derive ?? passphraseKeys)(passphrase, accountSalt, secretKey, accountId);
  return {
    recoveryKey,
    upload: {
      accountSalt,
      loginPublicKey: ed25519KeyPair(derived.login).publicKey,
      recoveryLoginPublicKey: ed25519KeyPair(recoveryLoginSeed(recoveryKey, accountId)).publicKey,
      unlock: {
        passphrase: sealAccountKey(derived.unlock, accountKey, accountId, { kind: "passphrase" }),
        recovery: sealAccountKey(recoveryKey, accountKey, accountId, { kind: "recovery" }),
      },
    },
  };
};
