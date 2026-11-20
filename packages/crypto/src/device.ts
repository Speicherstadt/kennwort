/**
 * Adding a device (P-04): the new device's one-time X-Wing key has a fingerprint of its own label,
 * which the QR code carries, and both devices show the same comparison code over that key and the
 * package before the device is admitted.
 *
 *   fp   = SHA-512/256(enc("kennwort/fp-device/v1", pk))
 *   code = SHA-512/256(enc("kennwort/device/v1", pk, package)), its first four bytes as a number
 *          (big-endian) mod 10⁶, written as six digits
 */
import { sha512_256 } from "@noble/hashes/sha2.js";
import { encode } from "./encoding.ts";

export const deviceFingerprint = (xwingPublicKey: Uint8Array) =>
  sha512_256(encode("kennwort/fp-device/v1", xwingPublicKey));

export const deviceCode = (xwingPublicKey: Uint8Array, pkg: Uint8Array) => {
  const hash = sha512_256(encode("kennwort/device/v1", xwingPublicKey, pkg));
  const value = new DataView(hash.slice(0, 4).buffer).getUint32(0);
  return String(value % 1_000_000).padStart(6, "0");
};
