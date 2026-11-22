/**
 * The cryptographic building blocks of Bitwarden's password-protected JSON export, for reading it
 * in the import (K-502 Teil 4). Every primitive is noble's: PBKDF2-HMAC-SHA256, Argon2id,
 * SHA-256, HKDF-Expand and HMAC-SHA256 from @noble/hashes, AES-256-CBC from @noble/ciphers. Only
 * Bitwarden's composition lives here, after bitwarden/sdk-internal (at c5c08aeb):
 *
 * - crates/bitwarden-crypto/src/keys/kdf.rs, derive_kdf_key (lines 34-88): PBKDF2-HMAC-SHA256,
 *   32 bytes; or Argon2id v1.3 with the memory in MiB (times 1024 KiB), 32 bytes, over the
 *   SHA-256 of the salt (line 70);
 * - crates/bitwarden-crypto/src/keys/utils.rs, stretch_key (lines 12-19): HKDF-Expand-SHA256 of
 *   that key with the infos "enc" and "mac", 32 bytes each;
 * - crates/bitwarden-exporters/src/encrypted_json.rs (line 49): the export's salt is its Base64
 *   text as UTF-8, not the decoded bytes; bitwarden/clients does the same in
 *   libs/legacy-crypto/src/services/default-key-generation.service.ts (deriveVaultExportKey,
 *   lines 97-103);
 * - the EncString of type 2 (AesCbc256_HmacSha256_B64): AES-256-CBC with PKCS#7 under the enc
 *   key, HMAC-SHA256 over IV ‖ ciphertext under the mac key; encrypt-then-MAC, so the MAC is
 *   checked, in constant time, before anything is decrypted.
 */
import { cbc } from "@noble/ciphers/aes.js";
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { expand } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { constantTimeEqual } from "./commitment.ts";
import { err, ok, type Result } from "./result.ts";

/** The KDF an export names: kdfType 0 (PBKDF2-SHA256) or 1 (Argon2id), memory in MiB */
export type BitwardenKdf =
  | { kind: "pbkdf2"; iterations: number }
  | { kind: "argon2id"; iterations: number; memoryMiB: number; parallelism: number };

/** A stretched key: AES-256 for the content, HMAC-SHA256 for its MAC */
export type BitwardenKey = { encKey: Uint8Array; macKey: Uint8Array };

/** The three parts of an EncString of type 2, "2.<iv>|<ct>|<mac>", decoded */
export type BitwardenCipherText = { iv: Uint8Array; data: Uint8Array; mac: Uint8Array };

const KEY_LENGTH = 32;
const utf8 = (text: string) => new TextEncoder().encode(text);

const derive = (password: Uint8Array, salt: Uint8Array, kdf: BitwardenKdf) =>
  kdf.kind === "pbkdf2"
    ? pbkdf2Async(sha256, password, salt, { c: kdf.iterations, dkLen: KEY_LENGTH })
    : argon2idAsync(password, sha256(salt), {
        t: kdf.iterations,
        m: kdf.memoryMiB * 1024,
        p: kdf.parallelism,
        dkLen: KEY_LENGTH,
      });

/**
 * The KDF's 32 bytes from the password and the salt text (derive_kdf_key). The caller keeps the
 * costs within its limits; a parameter noble refuses, such as no iterations, is `bad-kdf`.
 */
export const bitwardenKdf = async (
  password: string,
  salt: string,
  kdf: BitwardenKdf,
): Promise<Result<Uint8Array, "bad-kdf">> => {
  try {
    return ok(await derive(utf8(password), utf8(salt), kdf));
  } catch {
    return err("bad-kdf");
  }
};

/** The enc and mac keys from the KDF's output (stretch_key) */
export const bitwardenStretch = (material: Uint8Array): BitwardenKey => ({
  encKey: expand(sha256, material, utf8("enc"), KEY_LENGTH),
  macKey: expand(sha256, material, utf8("mac"), KEY_LENGTH),
});

/** The export's key from its password, salt and KDF (deriveVaultExportKey) */
export const bitwardenExportKey = async (
  password: string,
  salt: string,
  kdf: BitwardenKdf,
): Promise<Result<BitwardenKey, "bad-kdf">> => {
  const material = await bitwardenKdf(password, salt, kdf);
  if (!material.ok) return material;
  const key = bitwardenStretch(material.value);
  material.value.fill(0);
  return ok(key);
};

/**
 * An EncString of type 2 decrypted: the MAC over IV ‖ ciphertext first, compared in constant
 * time, so a wrong key or a changed byte is `bad-mac` before AES sees anything and the padding
 * check cannot become an oracle. Authentic but not decryptable (an IV of the wrong length, broken
 * PKCS#7) takes a broken writer: `bad-padding`.
 */
export const bitwardenDecrypt = (
  key: BitwardenKey,
  { iv, data, mac }: BitwardenCipherText,
): Result<Uint8Array, "bad-mac" | "bad-padding"> => {
  if (!constantTimeEqual(hmac(sha256, key.macKey, concatBytes(iv, data)), mac))
    return err("bad-mac");
  try {
    return ok(cbc(key.encKey, iv).decrypt(data));
  } catch {
    return err("bad-padding");
  }
};
