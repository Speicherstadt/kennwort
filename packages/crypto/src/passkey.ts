/**
 * F-12 of docs/sicherheitsdesign.md: the private key of a passkey Kennwort keeps for a website
 * (K-406, P-17). WebAuthn Level 3 (§5.8.5, §6.5.6) and every relying party accept ES256, ECDSA on
 * P-256 with SHA-256 (COSE algorithm -7), so that is the one algorithm Kennwort creates.
 *
 *   key       = 0x01 ‖ d (32 bytes, big endian, 1 ≤ d < n)
 *   public    = 0x04 ‖ x ‖ y (uncompressed point d·G, SEC 1 §2.3.3)
 *   signature = ECDSA-P256-SHA-256(d, message), ASN.1 DER (WebAuthn §6.5.6), low S, k after
 *               RFC 6979 (deterministic, so no weak random number can leak d)
 *
 * The key lives only inside an entry's ciphertext (P-09) and, while a sign-in is signed, in the
 * memory of the extension's prompt; `passkeySign` wipes its copy of d once the signature is made.
 */
import { p256 } from "@noble/curves/nist.js";
import { err, ok, type Result } from "./result.ts";

export const PASSKEY_KEY_V1 = 0x01;
export const PASSKEY_SCALAR_LENGTH = 32;
export const PASSKEY_KEY_LENGTH = 1 + PASSKEY_SCALAR_LENGTH;
/** The COSE algorithm of ES256 (RFC 9053, IANA COSE Algorithms) */
export const ES256 = -7;

export type PasskeyKeyError = "unknown-version" | "invalid-key";

/** A new key in F-12, from the platform's CSPRNG */
export const newPasskeyKey = (): Uint8Array => {
  const scalar = p256.utils.randomSecretKey();
  const key = new Uint8Array(PASSKEY_KEY_LENGTH);
  key[0] = PASSKEY_KEY_V1;
  key.set(scalar, 1);
  scalar.fill(0);
  return key;
};

/** The scalar of an F-12 key, as a copy the caller wipes; a key of another version is refused */
const scalarOf = (key: Uint8Array): Result<Uint8Array, PasskeyKeyError> => {
  if (key[0] !== PASSKEY_KEY_V1) return err("unknown-version");
  // isValidSecretKey also refuses a scalar of any length but 32 bytes
  const scalar = key.slice(1);
  if (!p256.utils.isValidSecretKey(scalar)) {
    scalar.fill(0);
    return err("invalid-key");
  }
  return ok(scalar);
};

/** The uncompressed public key (65 bytes) of an F-12 key */
export const passkeyPublicKey = (key: Uint8Array): Result<Uint8Array, PasskeyKeyError> => {
  const scalar = scalarOf(key);
  if (!scalar.ok) return scalar;
  const publicKey = p256.getPublicKey(scalar.value, false);
  scalar.value.fill(0);
  return ok(publicKey);
};

/**
 * The ES256 signature of a WebAuthn message (authenticatorData ‖ SHA-256(clientDataJSON)), DER
 * encoded as WebAuthn §6.5.6 asks; SHA-256 of the message is taken here (noble's prehash)
 */
export const passkeySign = (
  key: Uint8Array,
  message: Uint8Array,
): Result<Uint8Array, PasskeyKeyError> => {
  const scalar = scalarOf(key);
  if (!scalar.ok) return scalar;
  try {
    return ok(p256.sign(message, scalar.value, { prehash: true, lowS: true, format: "der" })); // i18n-ignore: a signature format
  } finally {
    scalar.value.fill(0);
  }
};
