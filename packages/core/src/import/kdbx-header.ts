/**
 * The outer header of a KeePass database in KDBX 4 (K-502 Teil 3): two signatures and the version,
 * then fields of type, length and value up to the end field, the KDF's parameters among them as a
 * VariantDictionary. Sources: keepassxreboot/keepassxc, src/format/KeePass2.h and KeePass2.cpp
 * (signatures, versions, field and type IDs, UUIDs of ciphers and KDFs),
 * src/format/KdbxReader.cpp (readMagicNumbers, the setters' checks), src/format/Kdbx4Reader.cpp
 * (readHeaderField, readVariantMap) and src/crypto/kdf/Argon2Kdf.cpp, AesKdf.cpp and Kdf.cpp
 * (the parameters' ranges).
 *
 * The file comes from outside: every length is checked against the bytes there are, the loops
 * only move forward, and every way to be malformed is an error value, never an exception.
 */
import type { KdbxCipher, KdbxKdf, Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import type { ImportError } from "./types.ts";

export type KdbxHeaderError = Extract<ImportError, "wrong-format" | "unsupported" | "bad-kdbx">;

export type KdbxHeader = {
  cipher: KdbxCipher;
  compressed: boolean;
  masterSeed: Uint8Array;
  iv: Uint8Array;
  kdf: KdbxKdf;
  /** Where the header ends: its SHA-256 and HMAC cover the bytes before, and follow them */
  end: number;
};

const SIGNATURE_1 = 0x9aa2d903;
const SIGNATURE_2 = 0xb54bfb67;
/** KeePass 1.x (.kdb) shares the first signature */
const SIGNATURE_2_KDB = 0xb54bfb65;
const MAJOR_VERSION = 4;

/** KeePass2::HeaderFieldID */
const END = 0;
const CIPHER = 2;
const COMPRESSION = 3;
const MASTER_SEED = 4;
const IV = 7;
const KDF_PARAMETERS = 11;
/** TransformSeed, TransformRounds, ProtectedStreamKey, StreamStartBytes, InnerRandomStreamID */
const LEGACY = new Set([5, 6, 8, 9, 10]);

const CIPHERS: Record<string, KdbxCipher> = {
  "31c1f2e6bf714350be5805216afc5aff": "aes256",
  d6038a2b8b6f4cb5a524339a31dbb59a: "chacha20",
};
const IV_LENGTH: Record<KdbxCipher, number> = { aes256: 16, chacha20: 12 };

const ARGON2: Record<string, "argon2d" | "argon2id"> = {
  ef636ddf8c29444b91f7a9a403e30a0c: "argon2d",
  "9e298b1956db4773b23dfc3ec6f0a1e6": "argon2id",
};
/** AES-KDF of KDBX 4 and the old UUID of KDBX 3, which KeePassXC still writes */
const AES_KDF = new Set(["7c02bb8279a74ac0927d114a00648238", "c9d9f39a628a4460bf740d08c18a4fea"]);

type Reader = { bytes: Uint8Array; view: DataView; at: number };

const reader = (bytes: Uint8Array): Reader => ({
  bytes,
  view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  at: 0,
});

/** The next `length` bytes, moving past them; undefined if there are fewer */
const take = (r: Reader, length: number): Uint8Array | undefined => {
  if (length > r.bytes.length - r.at) return undefined;
  r.at += length;
  return r.bytes.subarray(r.at - length, r.at);
};

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
const u32 = (r: Reader) => {
  const bytes = take(r, 4);
  return bytes && viewOf(bytes).getUint32(0, true);
};
/** A length and that many bytes after it */
const sized = (r: Reader) => {
  const length = u32(r);
  return length === undefined ? undefined : take(r, length);
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** An integer, or the bytes of a byte array, string or Boolean, as KeePassXC's QVariant holds them */
type Variant = number | Uint8Array;

/** KeePass2::VariantMapFieldType: how long each type's value is and how it reads */
const VARIANT_TYPES: Record<number, (value: Uint8Array) => Variant | undefined> = {
  4: (v) => (v.length === 4 ? viewOf(v).getUint32(0, true) : undefined),
  5: (v) => (v.length === 8 ? Number(viewOf(v).getBigUint64(0, true)) : undefined),
  8: (v) => (v.length === 1 ? v : undefined),
  12: (v) => (v.length === 4 ? viewOf(v).getInt32(0, true) : undefined),
  13: (v) => (v.length === 8 ? Number(viewOf(v).getBigInt64(0, true)) : undefined),
  24: (v) => v,
  66: (v) => v,
};
const VARIANT_VERSION = 0x0100;
const VARIANT_CRITICAL = 0xff00;

/** The VariantDictionary of the KDF parameters (Kdbx4Reader::readVariantMap) */
const variantMap = (
  bytes: Uint8Array,
): Result<Map<string, Variant>, "unsupported" | "bad-kdbx"> => {
  const r = reader(bytes);
  const version = take(r, 2);
  if (version && (viewOf(version).getUint16(0, true) & VARIANT_CRITICAL) > VARIANT_VERSION)
    return err("unsupported");
  const map = new Map<string, Variant>();
  for (;;) {
    const type = take(r, 1);
    if (!type) return err("bad-kdbx");
    if (type[0] === END) return ok(map);
    // A name cut short leaves no value either
    const name = sized(r);
    const raw = sized(r);
    const read = VARIANT_TYPES[type[0] as number];
    const value = read && raw && read(raw);
    if (value === undefined) return err("bad-kdbx");
    map.set(new TextDecoder().decode(name ?? new Uint8Array()), value);
  }
};

/** An integer parameter in its range, of whichever integer type the writer chose */
const integer = (map: Map<string, Variant>, name: string, min: number, max: number) => {
  const value = map.get(name);
  return typeof value === "number" && value >= min && value <= max ? value : undefined;
};
const bytesOf = (map: Map<string, Variant>, name: string, min: number, max: number) => {
  const value = map.get(name);
  return value instanceof Uint8Array && value.length >= min && value.length <= max
    ? value
    : undefined;
};

/** Kdf::setRounds takes a positive int below INT_MAX */
const MAX_ROUNDS = 2 ** 31 - 2;

/** Argon2Kdf::processParameters with its ranges; noble computes only versions 0x10 and 0x13 */
const argon2 = (
  kind: "argon2d" | "argon2id",
  map: Map<string, Variant>,
): Result<KdbxKdf, "unsupported" | "bad-kdbx"> => {
  const salt = bytesOf(map, "S", 8, 32);
  const version = integer(map, "V", 0x10, 0x13);
  const parallelism = integer(map, "P", 1, 2 ** 24 - 1);
  const memory = integer(map, "M", 8 * 1024, 2 ** 42 - 1);
  const iterations = integer(map, "I", 1, MAX_ROUNDS);
  if (!salt || !version || !parallelism || !memory || !iterations) return err("bad-kdbx");
  if (version !== 0x10 && version !== 0x13) return err("unsupported");
  const memoryKiB = Math.floor(memory / 1024);
  return ok({ kind, salt, version, parallelism, memoryKiB, iterations });
};

/** The KDF its UUID names (KeePass2::kdfFromParameters); AES-KDF's seed is an AES-256 key */
const kdfOf = (map: Map<string, Variant>): Result<KdbxKdf, "unsupported" | "bad-kdbx"> => {
  const uuid = bytesOf(map, "$UUID", 16, 16);
  if (!uuid) return err("bad-kdbx");
  const kind = ARGON2[hex(uuid)];
  if (kind) return argon2(kind, map);
  if (!AES_KDF.has(hex(uuid))) return err("unsupported");
  const seed = bytesOf(map, "S", 32, 32);
  const rounds = integer(map, "R", 1, MAX_ROUNDS);
  return seed && rounds ? ok({ kind: "aes", seed, rounds }) : err("bad-kdbx");
};

/** The fields up to the end field, by ID; legacy fields of KDBX 3 make it no KDBX 4 */
const fields = (r: Reader): Result<Map<number, Uint8Array>, "bad-kdbx"> => {
  const found = new Map<number, Uint8Array>();
  for (;;) {
    const head = take(r, 5);
    if (!head) return err("bad-kdbx");
    const id = head[0] as number;
    // The end field has a length and a value too
    const value = take(r, viewOf(head).getUint32(1, true));
    if (!value || LEGACY.has(id)) return err("bad-kdbx");
    if (id === END) return ok(found);
    found.set(id, value);
  }
};

/** The signatures and the version: KDBX 4 goes on, KeePass 1, KDBX 2 and 3 are unsupported */
const versionError = (r: Reader): KdbxHeaderError | undefined => {
  const first = u32(r);
  const second = u32(r);
  // A missing version reads as 0, which is no KDBX 4
  const version = Number(u32(r));
  if (first !== SIGNATURE_1 || (second !== SIGNATURE_2 && second !== SIGNATURE_2_KDB))
    return "wrong-format";
  return second === SIGNATURE_2_KDB || version >>> 16 !== MAJOR_VERSION ? "unsupported" : undefined;
};

/** The cipher its UUID names; Twofish and any other is unsupported */
const cipherOf = (uuid: Uint8Array | undefined): Result<KdbxCipher, KdbxHeaderError> => {
  if (uuid?.length !== 16) return err("bad-kdbx");
  const cipher = CIPHERS[hex(uuid)];
  return cipher ? ok(cipher) : err("unsupported");
};

/** The compression flags: 0 none, 1 gzip (KdbxReader::setCompressionFlags) */
const compressionOf = (flags: Uint8Array | undefined): Result<boolean, KdbxHeaderError> => {
  if (flags?.length !== 4) return err("bad-kdbx");
  const id = viewOf(flags).getUint32(0, true);
  return id <= 1 ? ok(id === 1) : err("unsupported");
};

export const readKdbxHeader = (file: Uint8Array): Result<KdbxHeader, KdbxHeaderError> => {
  const r = reader(file);
  const version = versionError(r);
  if (version) return err(version);
  const found = fields(r);
  if (!found.ok) return found;
  const field = (id: number) => found.value.get(id);
  const cipher = cipherOf(field(CIPHER));
  if (!cipher.ok) return cipher;
  const compressed = compressionOf(field(COMPRESSION));
  if (!compressed.ok) return compressed;
  const parameters = variantMap(field(KDF_PARAMETERS) ?? new Uint8Array());
  if (!parameters.ok) return parameters;
  const kdf = kdfOf(parameters.value);
  if (!kdf.ok) return kdf;
  const masterSeed = field(MASTER_SEED);
  const iv = field(IV);
  if (masterSeed?.length !== 32 || iv?.length !== IV_LENGTH[cipher.value]) return err("bad-kdbx");
  return ok({
    cipher: cipher.value,
    compressed: compressed.value,
    masterSeed,
    iv,
    kdf: kdf.value,
    end: r.at,
  });
};
