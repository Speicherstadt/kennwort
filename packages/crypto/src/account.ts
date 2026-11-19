/**
 * The account of docs/sicherheitsdesign.md (P-01, P-03, P-12): a random Account Key (AK), the key
 * block under AK with the user's secret keys and the pinned root fingerprint, and AK sealed under
 * each way to unlock it (passkey PRF, passphrase, recovery key).
 */
import { randomBytes } from "@noble/hashes/utils.js";
import { open, seal } from "./box.ts";
import { kdf } from "./derive.ts";
import { decode, encode } from "./encoding.ts";
import { bundleFingerprint } from "./fingerprint.ts";
import { err, ok, type Result } from "./result.ts";
import { ed25519KeyPair } from "./sign.ts";
import { xwingKeyPair } from "./wrap.ts";

export type UnlockPath =
  | { kind: "passkey"; credentialId: Uint8Array }
  | { kind: "passphrase" }
  | { kind: "recovery" };

export type KeyBlock = {
  xwing: { publicKey: Uint8Array; secretKey: Uint8Array };
  ed: { publicKey: Uint8Array; secretKey: Uint8Array };
  rootFingerprint: Uint8Array;
};

export const ACCOUNT_KEY_LENGTH = 32;

// What seal writes, open must read: a wrong length here would lock the data for good
const assertLength = (bytes: Uint8Array, length: number, name: string) => {
  if (bytes.length !== length) throw new RangeError(`${name} must be ${length} bytes`);
};

export const newAccountKey = () => randomBytes(ACCOUNT_KEY_LENGTH);
export const newRecoveryKey = () => randomBytes(32);

/** A key block with fresh key pairs; the root fingerprint comes from the invitation or the owner */
export const newKeyBlock = (rootFingerprint: Uint8Array): KeyBlock => {
  assertLength(rootFingerprint, 32, "root fingerprint");
  return { xwing: xwingKeyPair(), ed: ed25519KeyPair(), rootFingerprint };
};

export const keyBlockFingerprint = (block: KeyBlock) =>
  bundleFingerprint(block.xwing.publicKey, block.ed.publicKey);

const keyBlockPlace = (accountId: Uint8Array) => ({ purpose: "key-block", context: [accountId] });

export const sealKeyBlock = (accountKey: Uint8Array, accountId: Uint8Array, block: KeyBlock) => {
  assertLength(block.rootFingerprint, 32, "root fingerprint");
  return seal(
    accountKey,
    encode(block.xwing.secretKey, block.ed.secretKey, block.rootFingerprint),
    keyBlockPlace(accountId),
  );
};

export type KeyBlockError = "not-authentic" | "malformed";

export const openKeyBlock = (
  accountKey: Uint8Array,
  accountId: Uint8Array,
  sealed: Uint8Array,
): Result<KeyBlock, KeyBlockError> => {
  const opened = open(accountKey, sealed, keyBlockPlace(accountId));
  if (!opened.ok) return err("not-authentic");
  const parts = decode(opened.value);
  if (!parts.ok || parts.value.length !== 3) return err("malformed");
  const [xwingSecret, edSecret, rootFingerprint] = parts.value as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
  ];
  if (xwingSecret.length !== 32 || edSecret.length !== 32 || rootFingerprint.length !== 32)
    return err("malformed");
  return ok({ xwing: xwingKeyPair(xwingSecret), ed: ed25519KeyPair(edSecret), rootFingerprint });
};

/** The key a passkey's PRF output gives (P-03); credSalt is the passkey's random 32-byte PRF salt */
export const passkeyUnlockKey = (prf: Uint8Array, credSalt: Uint8Array, credentialId: Uint8Array) =>
  kdf(prf, credSalt, "kennwort/unlock-passkey/v1", credentialId);

const accountKeyPlace = (accountId: Uint8Array, path: UnlockPath) => ({
  purpose: "account-key",
  context:
    path.kind === "passkey" ? [accountId, path.kind, path.credentialId] : [accountId, path.kind],
});

export const sealAccountKey = (
  unlockKey: Uint8Array,
  accountKey: Uint8Array,
  accountId: Uint8Array,
  path: UnlockPath,
) => {
  assertLength(accountKey, ACCOUNT_KEY_LENGTH, "account key");
  return seal(unlockKey, accountKey, accountKeyPlace(accountId, path));
};

export const openAccountKey = (
  unlockKey: Uint8Array,
  sealed: Uint8Array,
  accountId: Uint8Array,
  path: UnlockPath,
): Result<Uint8Array, "not-authentic"> => {
  const opened = open(unlockKey, sealed, accountKeyPlace(accountId, path));
  return opened.ok && opened.value.length === ACCOUNT_KEY_LENGTH ? opened : err("not-authentic");
};
