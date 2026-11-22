/**
 * Fingerprints of public keys (F-04): SHA-512/256 over the encoded keys, each kind with its own
 * label, so a bundle, a root key and a recovery key never share a fingerprint.
 */
import { sha512_256 } from "@noble/hashes/sha2.js";
import { encode } from "./encoding.ts";

export const FINGERPRINT_LENGTH = 32;

export const bundleFingerprint = (xwingPublicKey: Uint8Array, edPublicKey: Uint8Array) =>
  sha512_256(encode("kennwort/fp/v1", xwingPublicKey, edPublicKey));

export const rootFingerprint = (edPublicKey: Uint8Array) =>
  sha512_256(encode("kennwort/fp-root/v1", edPublicKey));

export const recoveryFingerprint = (xwingPublicKey: Uint8Array) =>
  sha512_256(encode("kennwort/fp-recovery/v1", xwingPublicKey));

const CODE_DIGITS = 60;
const CODE_MODULUS = 10n ** BigInt(CODE_DIGITS);

/**
 * The comparison code of a fingerprint (F-04): the 32 bytes as a big-endian number modulo 10⁶⁰,
 * written as 60 digits in 12 groups of 5. About 199 bits: a bundle someone makes up to match it
 * by chance needs about 2¹⁹⁹ tries, unlike the six digits of a pairing (P-04), which a one-time
 * secret protects as well. Two people read it aloud to compare a key bundle (P-12).
 */
export const comparisonCode = (fingerprint: Uint8Array) => {
  if (fingerprint.length !== FINGERPRINT_LENGTH)
    throw new RangeError(`fingerprint must be ${FINGERPRINT_LENGTH} bytes`);
  const value = fingerprint.reduce((sum, byte) => (sum << 8n) | BigInt(byte), 0n) % CODE_MODULUS;
  const digits = value.toString().padStart(CODE_DIGITS, "0");
  return Array.from({ length: CODE_DIGITS / 5 }, (_, i) => digits.slice(5 * i, 5 * i + 5)).join(
    " ",
  );
};
