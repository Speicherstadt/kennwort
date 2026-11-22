/**
 * Unlocking (P-03): the passphrase with the Secret Key or the Recovery Key opens AK, AK opens the
 * key block and the account state. The AAD names account and way, so a ciphertext of another
 * account or way does not open.
 */
import { type KeyBlock, openAccountKey, openKeyBlock, passphraseKeys } from "@kennwort/crypto";
import { followRoot } from "../membership/root-change.ts";
import { err, ok, type Result } from "../result.ts";
import { type AccountState, openState } from "./state.ts";

export type Stored = {
  accountId: Uint8Array;
  accountSalt: Uint8Array;
  keyBlock: Uint8Array;
  state: Uint8Array;
  stateCounter: number;
  unlock: { passphrase: Uint8Array; recovery: Uint8Array };
};

export type Unlocked = { accountKey: Uint8Array; keyBlock: KeyBlock; state: AccountState };
export type UnlockError = "wrong-key" | "damaged";

/** AK already in hand (a new device got it in its package, P-04): open key block and state */
export const unlockWithAccountKey = (
  accountKey: Uint8Array,
  stored: Stored,
): Result<Unlocked, UnlockError> => {
  const keyBlock = openKeyBlock(accountKey, stored.accountId, stored.keyBlock);
  if (!keyBlock.ok) return err("damaged");
  const state = openState(accountKey, stored.accountId, stored.stateCounter, stored.state);
  if (!state.ok) return err("damaged");
  // The key block may still name a root that another device of the account saw replaced (P-07)
  return ok({ accountKey, keyBlock: followRoot(keyBlock.value, state.value), state: state.value });
};

export const unlockWithPassphrase = (
  stored: Stored,
  passphrase: string,
  secretKey: Uint8Array,
  derive: typeof passphraseKeys = passphraseKeys,
): Result<Unlocked, UnlockError> => {
  const { unlock } = derive(passphrase, stored.accountSalt, secretKey, stored.accountId);
  const accountKey = openAccountKey(unlock, stored.unlock.passphrase, stored.accountId, {
    kind: "passphrase",
  });
  return accountKey.ok ? unlockWithAccountKey(accountKey.value, stored) : err("wrong-key");
};

export const unlockWithRecoveryKey = (
  stored: Stored,
  recoveryKey: Uint8Array,
): Result<Unlocked, UnlockError> => {
  const accountKey = openAccountKey(recoveryKey, stored.unlock.recovery, stored.accountId, {
    kind: "recovery",
  });
  return accountKey.ok ? unlockWithAccountKey(accountKey.value, stored) : err("wrong-key");
};
