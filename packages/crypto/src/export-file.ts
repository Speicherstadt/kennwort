/**
 * F-13 of docs/sicherheitsdesign.md: Kennwort's own encrypted export (K-504, P-19), sealed under a
 * key from an export passphrase. Modelled on Bitwarden's password-protected export (a salt and
 * the KDF beside one AEAD ciphertext), but built only from Kennwort's primitives: Argon2id from
 * @noble/hashes, HKDF-SHA-512 (F-04) and the F-01 box (XChaCha20-Poly1305 from @noble/ciphers).
 *
 *   p₁    = Argon2id(NFKC(passphrase), salt (16 bytes)), m = 64 MiB, t = 3, p = 1   (fixed in v1)
 *   key   = kdf(p₁, empty, "kennwort/export/v1")
 *   file  = 0x01 ‖ salt ‖ F-01(key, plaintext, purpose "export", context salt)
 *
 * The parameters belong to the version and are not in the file, so a file cannot make a device
 * work harder than v1 says; stronger parameters are v2.
 */
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { NONCE_LENGTH, open, sealWithNonce } from "./box.ts";
import { kdf } from "./derive.ts";
import type { ArgonParams } from "./passphrase.ts";
import { randomBytes } from "./random.ts";
import { err, ok, type Result } from "./result.ts";

export const EXPORT_V1 = 0x01;
export const EXPORT_ARGON2_V1: ArgonParams = Object.freeze({ m: 64 * 1024, t: 3, p: 1 });
export const EXPORT_SALT_LENGTH = 16;
const HEADER_LENGTH = 1 + EXPORT_SALT_LENGTH;
const PURPOSE = "export";

export type ExportOpenError = "unknown-version" | "too-short" | "wrong-passphrase";

/** The key of an export: Argon2id of the passphrase in NFKC, then HKDF with the format's label */
const exportKey = async (params: ArgonParams, passphrase: string, salt: Uint8Array) => {
  const p1 = await argon2idAsync(passphrase.normalize("NFKC"), salt, { ...params, dkLen: 32 });
  return kdf(p1, new Uint8Array(), "kennwort/export/v1");
};

/** With given Argon2id parameters, salt and nonce; only for test vectors and tests */
export const sealExportWith = async (
  params: ArgonParams,
  passphrase: string,
  salt: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> => {
  if (salt.length !== EXPORT_SALT_LENGTH) throw new RangeError("export salt must be 16 bytes");
  if (passphrase === "") throw new RangeError("export passphrase must not be empty");
  // A lone surrogate would become U+FFFD and two passphrases one (as in encode, F-04)
  if (!passphrase.isWellFormed()) throw new RangeError("not well-formed text");
  const key = await exportKey(params, passphrase, salt);
  const box = sealWithNonce(key, nonce, plaintext, { purpose: PURPOSE, context: [salt] });
  const file = new Uint8Array(HEADER_LENGTH + box.length);
  file[0] = EXPORT_V1;
  file.set(salt, 1);
  file.set(box, HEADER_LENGTH);
  return file;
};

/** The plaintext sealed under the passphrase with a fresh salt and nonce */
export const sealExport = (passphrase: string, plaintext: Uint8Array): Promise<Uint8Array> =>
  sealExportWith(
    EXPORT_ARGON2_V1,
    passphrase,
    randomBytes(EXPORT_SALT_LENGTH),
    randomBytes(NONCE_LENGTH),
    plaintext,
  );

/**
 * With given Argon2id parameters; only for tests. Version and length are checked before the
 * costly KDF, so a file that is no export costs nothing.
 */
export const openExportWith = async (
  params: ArgonParams,
  passphrase: string,
  file: Uint8Array,
): Promise<Result<Uint8Array, ExportOpenError>> => {
  const version = file[0];
  if (version === undefined) return err("too-short");
  if (version !== EXPORT_V1) return err("unknown-version");
  // The box itself needs its version, nonce and tag: 1 + 24 + 16 bytes
  if (file.length < HEADER_LENGTH + 1 + NONCE_LENGTH + 16) return err("too-short");
  if (!passphrase.isWellFormed()) return err("wrong-passphrase");
  const salt = file.subarray(1, HEADER_LENGTH);
  const key = await exportKey(params, passphrase, salt);
  const opened = open(key, file.subarray(HEADER_LENGTH), { purpose: PURPOSE, context: [salt] });
  return opened.ok ? ok(opened.value) : err("wrong-passphrase");
};

export const openExport = (passphrase: string, file: Uint8Array) =>
  openExportWith(EXPORT_ARGON2_V1, passphrase, file);
