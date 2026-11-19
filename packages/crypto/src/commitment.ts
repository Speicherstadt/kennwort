/**
 * Key commitments of F-02 (docs/sicherheitsdesign.md): F-02 does not say who wrapped a key, so an
 * unwrapped key counts only when it matches a commitment that someone entitled has signed.
 *
 *   commitment(key, purpose, context…) = kdf(key, empty, "kennwort/key-commit/v1", purpose, context…)
 */
import { kdf } from "./derive.ts";
import type { Part } from "./encoding.ts";

export const keyCommitment = (key: Uint8Array, purpose: string, ...context: Part[]) =>
  kdf(key, new Uint8Array(), "kennwort/key-commit/v1", purpose, ...context);

/** Compares two byte strings in constant time (for their length): commitments, fingerprints */
export const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length &&
  a.reduce((diff, byte, index) => diff | (byte ^ (b[index] ?? 0)), 0) === 0;
