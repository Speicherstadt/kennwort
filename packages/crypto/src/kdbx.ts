/**
 * The cryptographic building blocks of KeePass's KDBX 4: for reading a database in the import
 * (K-502 Teil 3) and for writing one in the export (K-504, with Argon2id and ChaCha20 only;
 * KeePassXC's src/format/Kdbx4Writer.cpp). Every primitive is noble's:
 * SHA-256/512, HMAC-SHA-256 and Argon2d/id from @noble/hashes, AES-256 (CBC and the raw block for
 * AES-KDF), ChaCha20 and Salsa20 from @noble/ciphers. Only KDBX's composition lives here, after
 * KeePassXC (keepassxreboot/keepassxc): src/keys/CompositeKey.cpp and PasswordKey.cpp (the
 * composite key), src/crypto/kdf/Argon2Kdf.cpp and AesKdf.cpp with SymmetricCipher::aesKdf (the
 * KDFs), src/format/KeePass2.cpp (hmacKey), src/streams/HmacBlockStream.cpp (getHmacKey) and
 * src/format/Kdbx4Reader.cpp with KeePass2RandomStream.cpp (the keys and the inner stream).
 */
import { cbc, unsafe } from "@noble/ciphers/aes.js";
import { chacha20 } from "@noble/ciphers/chacha.js";
import { salsa20 } from "@noble/ciphers/salsa.js";
import { argon2dAsync, argon2idAsync } from "@noble/hashes/argon2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { err, ok, type Result } from "./result.ts";

export type KdbxArgon2 = {
  kind: "argon2d" | "argon2id";
  salt: Uint8Array;
  iterations: number;
  memoryKiB: number;
  parallelism: number;
  /** 0x10 or 0x13, the versions of Argon2 noble computes */
  version: number;
};
export type KdbxAesKdf = { kind: "aes"; seed: Uint8Array; rounds: number };
export type KdbxKdf = KdbxArgon2 | KdbxAesKdf;
export type KdbxCipher = "aes256" | "chacha20";
export type KdbxInnerStream = "salsa20" | "chacha20";

/** The password's part of the composite key: SHA-256 of its UTF-8 (PasswordKey::setPassword) */
export const kdbxPasswordPart = (password: string): Uint8Array =>
  sha256(new TextEncoder().encode(password));

/** SHA-256 over the parts' raw keys in order: password, then key file (CompositeKey::rawKey) */
export const kdbxCompositeKey = (parts: readonly Uint8Array[]): Uint8Array =>
  sha256(concatBytes(...parts));

/** How many AES-KDF rounds run between two turns of the event loop, so the page stays responsive */
const AES_ROUNDS_PER_TURN = 100_000;
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * AES-KDF: both 16-byte halves of the key encrypted `rounds` times with AES-256 under the seed,
 * then SHA-256 (AesKdf::transformKeyRaw). noble's raw block function, as a fresh ECB per round
 * would expand the key millions of times.
 */
const aesKdf = async ({ seed, rounds }: KdbxAesKdf, key: Uint8Array): Promise<Uint8Array> => {
  const expanded = unsafe.expandKeyLE(seed);
  const halves = [key.slice(0, 16), key.slice(16, 32)];
  for (let done = 0; done < rounds; ) {
    await turn();
    const until = Math.min(rounds, done + AES_ROUNDS_PER_TURN);
    for (; done < until; done++) for (const half of halves) unsafe.encryptBlock(expanded, half);
  }
  return sha256(concatBytes(...halves));
};

const ARGON2 = { argon2d: argon2dAsync, argon2id: argon2idAsync };

/** Argon2 with KeePass's choices: 32-byte tag, no secret, no associated data (Argon2Kdf.cpp) */
const argon2 = (kdf: KdbxArgon2, key: Uint8Array): Promise<Uint8Array> =>
  ARGON2[kdf.kind](key, kdf.salt, {
    t: kdf.iterations,
    m: kdf.memoryKiB,
    p: kdf.parallelism,
    version: kdf.version,
    dkLen: 32,
  });

/**
 * The transformed key from the composite key. The caller keeps the costs within its limits (noble
 * refuses Argon2 memory above 1 GiB by itself) and that an AES-KDF seed has 32 bytes; a parameter
 * noble refuses, such as Argon2 memory below 8 KiB per lane, is `bad-kdf`.
 */
export const kdbxTransformKey = async (
  composite: Uint8Array,
  kdf: KdbxKdf,
): Promise<Result<Uint8Array, "bad-kdf">> => {
  try {
    return ok(kdf.kind === "aes" ? await aesKdf(kdf, composite) : await argon2(kdf, composite));
  } catch {
    return err("bad-kdf");
  }
};

/**
 * The payload's cipher key, SHA-256(master seed ‖ transformed key), and the HMAC base key,
 * SHA-512(master seed ‖ transformed key ‖ 0x01) (Kdbx4Reader::readDatabaseImpl, KeePass2::hmacKey)
 */
export const kdbxKeys = (masterSeed: Uint8Array, transformed: Uint8Array) => ({
  cipherKey: sha256(concatBytes(masterSeed, transformed)),
  hmacKey: sha512(concatBytes(masterSeed, transformed, Uint8Array.of(1))),
});

/** The index as 8 bytes little-endian */
const uint64le = (index: bigint) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, index, true);
  return bytes;
};

/** The header's HMAC uses the block key of index 2^64 - 1 (Kdbx4Reader::readDatabaseImpl) */
export const KDBX_HEADER_INDEX = 2n ** 64n - 1n;

/**
 * HMAC-SHA-256 of a block (or, with KDBX_HEADER_INDEX, the header) under its own key,
 * SHA-512(index as uint64 LE ‖ HMAC base key) (HmacBlockStream::getHmacKey)
 */
export const kdbxBlockMac = (hmacKey: Uint8Array, index: bigint, data: Uint8Array): Uint8Array =>
  hmac(sha256, sha512(concatBytes(uint64le(index), hmacKey)), data);

/**
 * The payload decrypted: AES-256-CBC with PKCS#7 padding (a 16-byte IV) or ChaCha20 of RFC 8439
 * with counter 0 (a 12-byte IV; the caller checks its length, as the header reader does). The
 * HMAC is checked first, so broken padding means a broken writer, not an attack: `bad-payload`.
 */
export const kdbxDecrypt = (
  cipher: KdbxCipher,
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Result<Uint8Array, "bad-payload"> => {
  if (cipher === "chacha20") return ok(chacha20(key, iv, data));
  try {
    return ok(cbc(key, iv).decrypt(data));
  } catch {
    return err("bad-payload");
  }
};

/**
 * The payload encrypted, the writer's side of kdbxDecrypt (Kdbx4Writer::writeDatabase): ChaCha20
 * of RFC 8439 with counter 0 and a 12-byte IV, or AES-256-CBC with PKCS#7 padding and a 16-byte
 * IV. The caller picks a fresh IV per file.
 */
export const kdbxEncrypt = (
  cipher: KdbxCipher,
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array => (cipher === "chacha20" ? chacha20(key, iv, data) : cbc(key, iv).encrypt(data));

/** Salsa20's fixed nonce for the inner stream (KeePass2::INNER_STREAM_SALSA20_IV) */
const SALSA20_NONCE = Uint8Array.of(0xe8, 0x30, 0x09, 0x4b, 0x97, 0x20, 0x5d, 0x2a);

/**
 * The inner stream that hides protected values in the XML, `length` bytes of it from the start
 * (KeePass2RandomStream::init): Salsa20 under SHA-256(key) with the fixed nonce, or ChaCha20 under
 * the first 32 bytes of SHA-512(key) with the next 12 as nonce.
 */
export const kdbxInnerKeystream = (
  stream: KdbxInnerStream,
  key: Uint8Array,
  length: number,
): Uint8Array => {
  const zeros = new Uint8Array(length);
  if (stream === "salsa20") return salsa20(sha256(key), SALSA20_NONCE, zeros);
  const keyNonce = sha512(key);
  return chacha20(keyNonce.subarray(0, 32), keyNonce.subarray(32, 44), zeros);
};
