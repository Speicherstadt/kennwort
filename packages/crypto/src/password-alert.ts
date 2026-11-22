/**
 * F-09 of docs/sicherheitsdesign.md: the short, salted, slow hashes of the phishing warning (K-405,
 * P-17). The extension keeps them for the saved passwords while it is unlocked, and the content
 * script hashes what the user typed the same way, so neither a saved nor a typed password crosses
 * between the page's process and the extension in plain text.
 *
 *   tag     = Argon2id(UTF-8(password as typed), salt, m = 1 MiB, t = 2, p = 1, 4 bytes)
 *   hostTag = kdf(salt, "", "kennwort/alert-host/v1", host)[0..16)
 *
 * The salt is 16 random bytes, new with every unlock. The tag is short on purpose: four bytes
 * (32 bits) are enough to tell a few hundred saved passwords apart from what someone types (a false
 * match about once in ten million checks), but leave about 2^(entropy − 32) candidates for every
 * tag, so a tag alone cannot confirm a guessed password (after Google's Password Alert, which keeps
 * 37 bits of a salted SHA-1; Argon2id makes every guess cost about 1 MiB and some milliseconds on
 * top). The host tag lets the service worker compare the page's host without a host in plain text.
 */
import { argon2id } from "@noble/hashes/argon2.js";
import { kdf } from "./derive.ts";

export type AlertParams = { m: number; t: number; p: number };
export const PASSWORD_ALERT_V1: AlertParams = Object.freeze({ m: 1024, t: 2, p: 1 });
export const ALERT_SALT_LENGTH = 16;
export const ALERT_TAG_LENGTH = 4;
export const ALERT_HOST_TAG_LENGTH = 16;

const utf8 = new TextEncoder();
const NO_SALT = new Uint8Array(0);

const checkSalt = (salt: Uint8Array) => {
  if (salt.length !== ALERT_SALT_LENGTH) throw new RangeError("alert salt must be 16 bytes");
};

/** The tag of a password, saved or typed; the bytes as typed, without normalisation */
export const alertTag = (password: string, salt: Uint8Array): Uint8Array => {
  checkSalt(salt);
  return argon2id(utf8.encode(password), salt, { ...PASSWORD_ALERT_V1, dkLen: ALERT_TAG_LENGTH });
};

/** The tag of an exact host (page/matches.ts), keyed by the same salt */
export const alertHostTag = (host: string, salt: Uint8Array): Uint8Array => {
  checkSalt(salt);
  return kdf(salt, NO_SALT, "kennwort/alert-host/v1", host).slice(0, ALERT_HOST_TAG_LENGTH);
};
