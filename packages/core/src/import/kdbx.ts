/**
 * KeePass databases in KDBX 4 (K-502 Teil 3), the format of KeePass 2, KeePassXC and Passbolt's
 * KDBX export: the header (kdbx-header.ts), the composite key from password and key file
 * (kdbx-key.ts), the KDF and the header's SHA-256 and HMAC, the HMAC blocks, the cipher, gzip
 * through the platform's `DecompressionStream`, the inner header (kdbx-payload.ts), the protected
 * values (kdbx-xml.ts) and then the KeePass XML parser. The cryptography is @kennwort/crypto's,
 * built on @noble; the order of the steps follows keepassxreboot/keepassxc,
 * src/format/Kdbx4Reader.cpp (readDatabaseImpl), except that the header's SHA-256 is checked
 * before the costly KDF.
 *
 * The file and its parameters come from outside: the KDF's cost and the unpacked size have
 * limits, so no database makes the device work for minutes or fill its memory. Keys and plain
 * text live in memory only, until the garbage collector takes them, like every decrypted entry;
 * JavaScript gives no way to wipe the strings they end up in.
 */
import {
  constantTimeEqual,
  KDBX_HEADER_INDEX,
  type KdbxKdf,
  kdbxBlockMac,
  kdbxCompositeKey,
  kdbxDecrypt,
  kdbxInnerKeystream,
  kdbxKeys,
  kdbxTransformKey,
  type Result,
  sha256,
} from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import { type KdbxHeader, readKdbxHeader } from "./kdbx-header.ts";
import { compositeCandidates } from "./kdbx-key.ts";
import { joinBytes, readHmacBlocks, readInnerHeader } from "./kdbx-payload.ts";
import { unprotect } from "./kdbx-xml.ts";
import { keePassEntries } from "./keepass-xml.ts";
import { decodeText } from "./text.ts";
import type { FileParser, ImportError, ImportKey, ImportResult, LockedParser } from "./types.ts";
import { parseXml } from "./xml.ts";

/**
 * How much a database may make the device do. KeePassXC's defaults (Argon2d, 64 MiB, the
 * iterations of one second, AES-KDF with the rounds of one second) stay well inside; noble in
 * JavaScript is slower than KeePassXC, so these allow about a minute and no more.
 */
export type KdbxLimits = {
  /** Argon2's memory in KiB */
  memoryKiB: number;
  /** Argon2's passes over its memory */
  iterations: number;
  /** Argon2's memory times its passes, in KiB: the work it takes */
  work: number;
  /**
   * Argon2's lanes. noble computes them one after another, and with many lanes each holds so few
   * blocks that the overhead per segment dominates: 1 GiB in 131 072 lanes (KeePass allows up to
   * 2^24 - 1) takes six times as long as in two. Up to 256 lanes it stays within a third.
   */
  parallelism: number;
  /** AES-KDF's rounds */
  aesRounds: number;
  /** The unpacked payload in bytes, as large as the ZIP reader allows */
  bytes: number;
};
export const KDBX_LIMITS: KdbxLimits = {
  memoryKiB: 1024 * 1024,
  iterations: 100,
  work: 8 * 1024 * 1024,
  parallelism: 256,
  aesRounds: 100_000_000,
  bytes: 64 * 1024 * 1024,
};

/** Whether the KDF stays within the limits */
const affordable = (kdf: KdbxKdf, limits: KdbxLimits) =>
  kdf.kind === "aes"
    ? kdf.rounds <= limits.aesRounds
    : kdf.memoryKiB <= limits.memoryKiB &&
      kdf.iterations <= limits.iterations &&
      kdf.parallelism <= limits.parallelism &&
      kdf.memoryKiB * kdf.iterations <= limits.work;

/** gzip unpacked with the platform, stopped as soon as it gives more than `max` bytes */
export const gunzip = async (
  packed: Uint8Array,
  max: number,
): Promise<Result<Uint8Array, "bad-kdbx" | "too-large">> => {
  const stream = new Blob([packed as Uint8Array<ArrayBuffer>]).stream();
  const reader = stream.pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read().catch(() => undefined);
    if (!chunk) return err("bad-kdbx");
    if (chunk.done) break;
    length += chunk.value.length;
    chunks.push(chunk.value);
    if (length > max) {
      void reader.cancel();
      return err("too-large");
    }
  }
  return ok(joinBytes(chunks));
};

type Keys = { cipherKey: Uint8Array; hmacKey: Uint8Array };

/** The first composite key whose keys give the header's HMAC, or `wrong-key` */
const unlock = async (
  file: Uint8Array,
  header: KdbxHeader,
  candidates: Uint8Array[][],
): Promise<Result<Keys, "wrong-key" | "bad-kdbx">> => {
  const headerBytes = file.subarray(0, header.end);
  const storedMac = file.subarray(header.end + 32, header.end + 64);
  for (const parts of candidates) {
    const transformed = await kdbxTransformKey(kdbxCompositeKey(parts), header.kdf);
    if (!transformed.ok) return err("bad-kdbx");
    const keys = kdbxKeys(header.masterSeed, transformed.value);
    const mac = kdbxBlockMac(keys.hmacKey, KDBX_HEADER_INDEX, headerBytes);
    if (constantTimeEqual(mac, storedMac)) return ok(keys);
  }
  return err("wrong-key");
};

/** The payload after the header: blocks checked, decrypted and, if packed, unpacked */
const payloadOf = async (
  file: Uint8Array,
  header: KdbxHeader,
  keys: Keys,
  limits: KdbxLimits,
): Promise<Result<Uint8Array, "bad-kdbx" | "too-large">> => {
  const blocks = readHmacBlocks(file, header.end + 64, keys.hmacKey);
  if (!blocks.ok) return blocks;
  const plain = kdbxDecrypt(header.cipher, keys.cipherKey, header.iv, blocks.value);
  if (!plain.ok) return err("bad-kdbx");
  if (!header.compressed) return plain.value.length <= limits.bytes ? plain : err("too-large");
  return gunzip(plain.value, limits.bytes);
};

/** The entries of the unpacked payload: inner header, XML, protected values, entries */
const entriesOf = (payload: Uint8Array): ImportResult => {
  const inner = readInnerHeader(payload);
  if (!inner.ok) return inner;
  const text = decodeText(inner.value.xml);
  const xml = text.ok ? parseXml(text.value) : text;
  if (!xml.ok) return err("bad-kdbx");
  const { stream, key } = inner.value;
  const plain = unprotect(xml.value, (length) => kdbxInnerKeystream(stream, key, length));
  return plain.ok ? keePassEntries(plain.value) : plain;
};

/** The header, then its SHA-256: both need no key, so a broken file fails before the KDF */
const checkedHeader = (file: Uint8Array, limits: KdbxLimits): Result<KdbxHeader, ImportError> => {
  const header = readKdbxHeader(file);
  if (!header.ok) return header;
  const { end, kdf } = header.value;
  // The SHA-256 and the HMAC must both be there; a cut HMAC would otherwise read as a wrong key
  if (file.length < end + 64) return err("bad-kdbx");
  const hash = file.subarray(end, end + 32);
  if (!constantTimeEqual(sha256(file.subarray(0, end)), hash)) return err("bad-kdbx");
  return affordable(kdf, limits) ? header : err("too-costly");
};

/** A KDBX 4 database opened with its password and key file, entries out, errors as values */
export const openKdbx = async (
  file: Uint8Array,
  key: ImportKey,
  limits: KdbxLimits = KDBX_LIMITS,
): Promise<ImportResult> => {
  const header = checkedHeader(file, limits);
  if (!header.ok) return header;
  const candidates = compositeCandidates(key);
  if (!candidates.ok) return candidates;
  const keys = await unlock(file, header.value, candidates.value);
  if (!keys.ok) return keys;
  const payload = await payloadOf(file, header.value, keys.value, limits);
  return payload.ok ? entriesOf(payload.value) : payload;
};

export const unlockKdbx: LockedParser = (file, key) => openKdbx(file, key);

/**
 * Without the key a database only says whether it is one Kennwort can open: a sound KDBX 4 header
 * is `encrypted`, so the import flow asks for the password and calls unlockKdbx.
 */
export const checkKdbx: FileParser = (file) => {
  const header = checkedHeader(file, KDBX_LIMITS);
  return header.ok ? err("encrypted") : header;
};
