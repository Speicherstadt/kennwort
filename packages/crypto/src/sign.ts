/**
 * F-03 of docs/sicherheitsdesign.md: Ed25519 (RFC 8032, @noble/curves) over a message that names its
 * purpose, so a signature for one use never counts for another.
 *
 *   signature = 0x01 ‖ Ed25519.Sign(sk, enc("kennwort/sig/v1", purpose, field…))
 *
 * Verification is strict RFC 8032 (canonical S, no small-order points), not ZIP-215.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { encode, type Part } from "./encoding.ts";

export const SIGNATURE_V1 = 0x01;
export const SIGNATURE_LENGTH = 65;
const LABEL = "kennwort/sig/v1";

/** An Ed25519 key pair; the 32-byte secret key is the RFC 8032 seed */
export const ed25519KeyPair = (seed?: Uint8Array) => ed25519.keygen(seed);

const message = (purpose: string, fields: Part[]) => encode(LABEL, purpose, ...fields);

export const sign = (secretKey: Uint8Array, purpose: string, ...fields: Part[]): Uint8Array => {
  const signature = new Uint8Array(SIGNATURE_LENGTH);
  signature[0] = SIGNATURE_V1;
  signature.set(ed25519.sign(message(purpose, fields), secretKey), 1);
  return signature;
};

/** True only for a version-1 signature by this key over exactly this purpose and these fields */
export const verify = (
  publicKey: Uint8Array,
  signature: Uint8Array,
  purpose: string,
  ...fields: Part[]
): boolean => {
  if (signature[0] !== SIGNATURE_V1) return false;
  try {
    // A signature of the wrong length makes @noble/curves throw
    return ed25519.verify(signature.subarray(1), message(purpose, fields), publicKey, {
      zip215: false,
    });
  } catch {
    return false;
  }
};
