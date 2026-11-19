/**
 * F-05 of docs/sicherheitsdesign.md: from passphrase and Secret Key to the keys that unlock the
 * account and sign the login. The Argon2id parameters belong to the format version and are never
 * read from the server, so a server cannot lower them (E-18).
 *
 *   p₁     = Argon2id(NFKC(passphrase), salt = accountSalt (16 bytes)), m = 64 MiB, t = 3, p = 1
 *   unlock = kdf(p₁, secretKey, "kennwort/unlock-passphrase/v1", accountId)
 *   login  = kdf(p₁, secretKey, "kennwort/login/v1", accountId)
 */
import { argon2id } from "@noble/hashes/argon2.js";
import { kdf } from "./derive.ts";

export type ArgonParams = { m: number; t: number; p: number };
export const PASSPHRASE_V1: ArgonParams = Object.freeze({ m: 64 * 1024, t: 3, p: 1 });
export const ACCOUNT_SALT_LENGTH = 16;
export const SECRET_KEY_LENGTH = 16;

export type PassphraseKeys = { unlock: Uint8Array; login: Uint8Array };

/** With given Argon2id parameters; only for tests, every other caller uses `passphraseKeys` */
export const passphraseKeysWith = (
  params: ArgonParams,
  passphrase: string,
  accountSalt: Uint8Array,
  secretKey: Uint8Array,
  accountId: Uint8Array,
): PassphraseKeys => {
  if (accountSalt.length !== ACCOUNT_SALT_LENGTH)
    throw new RangeError("account salt must be 16 bytes");
  if (secretKey.length !== SECRET_KEY_LENGTH) throw new RangeError("secret key must be 16 bytes");
  // A lone surrogate would become U+FFFD and two passphrases one (as in encode, F-04)
  if (!passphrase.isWellFormed()) throw new RangeError("not well-formed text");
  const p1 = argon2id(passphrase.normalize("NFKC"), accountSalt, { ...params, dkLen: 32 });
  return {
    unlock: kdf(p1, secretKey, "kennwort/unlock-passphrase/v1", accountId),
    login: kdf(p1, secretKey, "kennwort/login/v1", accountId),
  };
};

export const passphraseKeys = (
  passphrase: string,
  accountSalt: Uint8Array,
  secretKey: Uint8Array,
  accountId: Uint8Array,
): PassphraseKeys =>
  passphraseKeysWith(PASSPHRASE_V1, passphrase, accountSalt, secretKey, accountId);
