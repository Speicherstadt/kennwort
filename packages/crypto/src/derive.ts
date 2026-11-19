/**
 * Key derivation of docs/sicherheitsdesign.md (F-04):
 *   kdf(ikm, salt, purpose, …) = HKDF-SHA-512(ikm, salt, info = enc(purpose, …), L = 32)
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { encode, type Part } from "./encoding.ts";

export const DERIVED_LENGTH = 32;

export const kdf = (ikm: Uint8Array, salt: Uint8Array, purpose: string, ...context: Part[]) =>
  hkdf(sha512, ikm, salt, encode(purpose, ...context), DERIVED_LENGTH);
