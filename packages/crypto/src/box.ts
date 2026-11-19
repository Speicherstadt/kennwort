/**
 * F-01 of docs/sicherheitsdesign.md: XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha, @noble/ciphers)
 * with a random 24-byte nonce and associated data that binds the ciphertext to its purpose and place.
 *
 *   box = 0x01 ‖ nonce (24) ‖ ciphertext ‖ tag (16)
 *   aad = enc("kennwort/box/v1", purpose, context…)
 *
 * A box of an unknown version is an error, never a reason to fall back (E-17).
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { encode, type Part } from "./encoding.ts";
import { err, ok, type Result } from "./result.ts";

export const BOX_V1 = 0x01;
export const KEY_LENGTH = 32;
export const NONCE_LENGTH = 24;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 1 + NONCE_LENGTH;
const LABEL = "kennwort/box/v1";

/** Where a ciphertext belongs: the purpose and the IDs it is bound to */
export type BoxContext = { purpose: string; context: Part[] };
export type OpenError = "unknown-version" | "too-short" | "wrong-key-length" | "not-authentic";

export const boxAad = ({ purpose, context }: BoxContext): Uint8Array =>
  encode(LABEL, purpose, ...context);

const assertKey = (key: Uint8Array) => {
  if (key.length !== KEY_LENGTH) throw new RangeError(`key must be ${KEY_LENGTH} bytes`);
};

/** Seals with a given nonce; only for test vectors, every other caller uses `seal` */
export const sealWithNonce = (
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  where: BoxContext,
): Uint8Array => {
  assertKey(key);
  if (nonce.length !== NONCE_LENGTH) throw new RangeError(`nonce must be ${NONCE_LENGTH} bytes`);
  const sealed = xchacha20poly1305(key, nonce, boxAad(where)).encrypt(plaintext);
  const box = new Uint8Array(HEADER_LENGTH + sealed.length);
  box[0] = BOX_V1;
  box.set(nonce, 1);
  box.set(sealed, HEADER_LENGTH);
  return box;
};

export const seal = (key: Uint8Array, plaintext: Uint8Array, where: BoxContext): Uint8Array =>
  sealWithNonce(key, randomBytes(NONCE_LENGTH), plaintext, where);

export const open = (
  key: Uint8Array,
  box: Uint8Array,
  where: BoxContext,
): Result<Uint8Array, OpenError> => {
  if (key.length !== KEY_LENGTH) return err("wrong-key-length");
  const version = box[0];
  if (version === undefined) return err("too-short");
  if (version !== BOX_V1) return err("unknown-version");
  if (box.length < HEADER_LENGTH + TAG_LENGTH) return err("too-short");
  const nonce = box.subarray(1, HEADER_LENGTH);
  try {
    return ok(xchacha20poly1305(key, nonce, boxAad(where)).decrypt(box.subarray(HEADER_LENGTH)));
  } catch {
    return err("not-authentic");
  }
};
