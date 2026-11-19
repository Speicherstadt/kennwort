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
