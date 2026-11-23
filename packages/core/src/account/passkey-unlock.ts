/**
 * Unlocking with a passkey (K-707, P-03), split from passkeys.ts, which the account state reads:
 * AK sealed under the key the passkey's PRF output gives, then checked against the state.
 */
import {
  constantTimeEqual,
  openAccountKey,
  passkeyUnlockKey,
  sealAccountKey,
} from "@kennwort/crypto";
import { err, type Result } from "../result.ts";
import { activeSalt } from "./passkeys.ts";
import { type Stored, type UnlockError, type Unlocked, unlockWithAccountKey } from "./unlock.ts";

/** The unlock key of a passkey, used once and overwritten */
export const withUnlockKey = <T>(
  prf: Uint8Array,
  salt: Uint8Array,
  credentialId: Uint8Array,
  use: (key: Uint8Array) => T,
) => {
  const key = passkeyUnlockKey(prf, salt, credentialId);
  try {
    return use(key);
  } finally {
    key.fill(0);
  }
};

/** AK sealed under a passkey's PRF output: all of it the server ever gets of this way */
export const sealPasskeyUnlock = (
  prf: Uint8Array,
  salt: Uint8Array,
  credentialId: Uint8Array,
  accountKey: Uint8Array,
  accountId: Uint8Array,
) =>
  withUnlockKey(prf, salt, credentialId, (key) =>
    sealAccountKey(key, accountKey, accountId, { kind: "passkey", credentialId }),
  );

export type PasskeyUnlockError = UnlockError | "not-set-up" | "unknown-way";

/**
 * Opens AK with the PRF output, then key block and state. The state must name this passkey with
 * this salt: one the server added or kept after its removal does not unlock (E-01, E-03).
 */
export const unlockWithPasskey = (
  stored: Stored,
  credentialId: Uint8Array,
  salt: Uint8Array,
  prf: Uint8Array,
): Result<Unlocked, PasskeyUnlockError> => {
  const way = stored.unlock.passkeys?.find((p) => constantTimeEqual(p.credentialId, credentialId));
  if (!way) return err("not-set-up");
  const accountKey = withUnlockKey(prf, salt, credentialId, (key) =>
    openAccountKey(key, way.sealed, stored.accountId, { kind: "passkey", credentialId }),
  );
  if (!accountKey.ok) return err("wrong-key");
  const unlocked = unlockWithAccountKey(accountKey.value, stored);
  if (!unlocked.ok) return unlocked;
  const known = activeSalt(unlocked.value.state.passkeys, credentialId);
  return known && constantTimeEqual(known, salt) ? unlocked : err("unknown-way");
};
