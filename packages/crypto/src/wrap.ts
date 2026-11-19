/**
 * F-02 of docs/sicherheitsdesign.md: a payload (usually a key) wrapped to a public key with X-Wing
 * (draft-connolly-cfrg-xwing-kem: X25519 + ML-KEM-768, @noble/post-quantum `ml_kem768_x25519`).
 *
 *   (ss, ct) = X-Wing.Encaps(pk)
 *   k        = kdf(ss, empty, "kennwort/wrap/v1", fp(recipient), purpose, context…)
 *   package  = 0x01 ‖ ct (1120) ‖ F-01(k, payload, purpose "wrap", context fp, purpose, context…)
 *
 * F-02 does not say who wrapped: a caller accepts an unwrapped key only against a signed binding.
 */
import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import { type BoxContext, open, seal, sealWithNonce } from "./box.ts";
import { kdf } from "./derive.ts";
import type { Part } from "./encoding.ts";
import { err, type Result } from "./result.ts";

export const WRAP_V1 = 0x01;
export const XWING_PUBLIC_KEY_LENGTH = 1216;
export const XWING_SECRET_KEY_LENGTH = 32;
export const XWING_CIPHERTEXT_LENGTH = 1120;
const KEM_END = 1 + XWING_CIPHERTEXT_LENGTH;
// The smallest box: version, nonce and tag around an empty payload
const SMALLEST_PACKAGE = KEM_END + 1 + 24 + 16;

export type Recipient = { publicKey: Uint8Array; fingerprint: Uint8Array };
export type UnwrapError = "unknown-version" | "too-short" | "wrong-key-length" | "not-authentic";

/** An X-Wing key pair; the 32-byte secret key is the seed both halves are derived from */
export const xwingKeyPair = (seed?: Uint8Array) => xwing.keygen(seed);

const sharedKey = (ss: Uint8Array, fingerprint: Uint8Array, purpose: string, context: Part[]) =>
  kdf(ss, new Uint8Array(), "kennwort/wrap/v1", fingerprint, purpose, ...context);

const innerContext = (fingerprint: Uint8Array, purpose: string, context: Part[]): BoxContext => ({
  purpose: "wrap",
  context: [fingerprint, purpose, ...context],
});

const assemble = (cipherText: Uint8Array, box: Uint8Array) => {
  const pkg = new Uint8Array(KEM_END + box.length);
  pkg[0] = WRAP_V1;
  pkg.set(cipherText, 1);
  pkg.set(box, KEM_END);
  return pkg;
};

/** Wraps with given randomness; only for test vectors, every other caller uses `wrap` */
export const wrapWithRandomness = (
  to: Recipient,
  payload: Uint8Array,
  { purpose, context }: BoxContext,
  randomness: { kem: Uint8Array; nonce: Uint8Array },
): Uint8Array => {
  const { cipherText, sharedSecret } = xwing.encapsulate(to.publicKey, randomness.kem);
  const key = sharedKey(sharedSecret, to.fingerprint, purpose, context);
  const where = innerContext(to.fingerprint, purpose, context);
  return assemble(cipherText, sealWithNonce(key, randomness.nonce, payload, where));
};

export const wrap = (to: Recipient, payload: Uint8Array, { purpose, context }: BoxContext) => {
  const { cipherText, sharedSecret } = xwing.encapsulate(to.publicKey);
  const key = sharedKey(sharedSecret, to.fingerprint, purpose, context);
  return assemble(cipherText, seal(key, payload, innerContext(to.fingerprint, purpose, context)));
};

/** Unwraps with the recipient's secret key and own fingerprint */
export const unwrap = (
  secretKey: Uint8Array,
  fingerprint: Uint8Array,
  pkg: Uint8Array,
  { purpose, context }: BoxContext,
): Result<Uint8Array, UnwrapError> => {
  if (secretKey.length !== XWING_SECRET_KEY_LENGTH) return err("wrong-key-length");
  const version = pkg[0];
  if (version === undefined) return err("too-short");
  if (version !== WRAP_V1) return err("unknown-version");
  if (pkg.length < SMALLEST_PACKAGE) return err("too-short");
  const sharedSecret = xwing.decapsulate(pkg.subarray(1, KEM_END), secretKey);
  const key = sharedKey(sharedSecret, fingerprint, purpose, context);
  const opened = open(key, pkg.subarray(KEM_END), innerContext(fingerprint, purpose, context));
  return opened.ok ? opened : err("not-authentic");
};
