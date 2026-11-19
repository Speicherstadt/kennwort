/** SHA-512/256 (FIPS 180-4), the hash of chains and fingerprints in docs/sicherheitsdesign.md */
import { sha512_256 } from "@noble/hashes/sha2.js";

export const DIGEST_LENGTH = 32;
export const digest = (bytes: Uint8Array): Uint8Array => sha512_256(bytes);
