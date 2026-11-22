/**
 * The KDBX 4 export (K-504): a KeePass database KeePass 2, KeePassXC and Kennwort's own reader
 * (import/kdbx.ts) open with the export's password. Argon2id and ChaCha20 for the payload and the
 * inner stream, uncompressed; the building blocks are the reader's from @kennwort/crypto (on
 * @noble). The framing follows keepassxreboot/keepassxc, src/format/Kdbx4Writer.cpp
 * (writeDatabase, writeInnerHeaderField, writeVariantMap), src/streams/HmacBlockStream.cpp
 * (writeHashedBlock) and KeePass2.cpp (the UUIDs).
 *
 *   file = signatures ‖ version 4.0 ‖ header fields ‖ SHA-256(header) ‖ HMAC(header)
 *          ‖ HMAC blocks of ChaCha20(inner header ‖ XML)
 */
import {
  KDBX_HEADER_INDEX,
  type KdbxArgon2,
  type KdbxInnerStream,
  kdbxBlockMac,
  kdbxCompositeKey,
  kdbxEncrypt,
  kdbxInnerKeystream,
  kdbxKeys,
  kdbxPasswordPart,
  kdbxTransformKey,
  sha256,
} from "@kennwort/crypto";
import { INNER_STREAMS, joinBytes } from "../import/kdbx-payload.ts";
import { flatEntry } from "./flat.ts";
import { kdbxXml, protectXml, type Random } from "./kdbx-xml.ts";
import type { ExportVault } from "./payload.ts";

/** How hard the export's key is to guess; KeePassXC's own default is Argon2 with 64 MiB too */
export type KdbxArgon2Cost = Pick<KdbxArgon2, "memoryKiB" | "iterations" | "parallelism">;
export const KDBX_EXPORT_ARGON2: KdbxArgon2Cost = Object.freeze({
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
});

export type KdbxWriteOptions = { argon2: KdbxArgon2Cost; random: Random };

const u32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};
const u64 = (value: number) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
};
const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) as string[], (b) => parseInt(b, 16));
const utf8 = new TextEncoder();

/** A header field: its ID, its length as uint32 and its value (Kdbx4Writer::writeHeaderField) */
const field = (id: number, value: Uint8Array) =>
  joinBytes([Uint8Array.of(id), u32(value.length), value]);

/** KeePass2.cpp: CIPHER_CHACHA20 and KDF_ARGON2ID */
const CHACHA20 = fromHex("d6038a2b8b6f4cb5a524339a31dbb59a");
const ARGON2ID = fromHex("9e298b1956db4773b23dfc3ec6f0a1e6");

/** A VariantDictionary entry: type, name and value, each name and value with its length */
const variant = (type: number, name: string, value: Uint8Array) =>
  joinBytes([Uint8Array.of(type), u32(name.length), utf8.encode(name), u32(value.length), value]);

/** The KDF parameters as KeePassXC writes them for Argon2id, version 0x13 */
const kdfParameters = (kdf: KdbxArgon2) =>
  joinBytes([
    Uint8Array.of(0x00, 0x01),
    variant(0x42, "$UUID", ARGON2ID),
    variant(0x42, "S", kdf.salt),
    variant(0x04, "P", u32(kdf.parallelism)),
    variant(0x05, "M", u64(kdf.memoryKiB * 1024)),
    variant(0x05, "I", u64(kdf.iterations)),
    variant(0x04, "V", u32(kdf.version)),
    Uint8Array.of(0x00),
  ]);

/** Signatures, version 4.0 and the fields up to the end field (Kdbx4Writer::writeDatabase) */
const header = (masterSeed: Uint8Array, iv: Uint8Array, kdf: KdbxArgon2) =>
  joinBytes([
    u32(0x9aa2d903),
    u32(0xb54bfb67),
    u32(0x00040000),
    field(2, CHACHA20),
    field(3, u32(0)),
    field(4, masterSeed),
    field(7, iv),
    field(11, kdfParameters(kdf)),
    field(0, utf8.encode("\r\n\r\n")),
  ]);

/** HmacBlockStream's default block size */
const BLOCK_SIZE = 1024 * 1024;

/** The payload in HMAC blocks, each MAC over index, size and data, ended by an empty block */
export const hmacBlocks = (data: Uint8Array, hmacKey: Uint8Array): Uint8Array => {
  const blocks: Uint8Array[] = [];
  for (let at = 0, index = 0; ; at += BLOCK_SIZE, index++) {
    const chunk = data.subarray(at, at + BLOCK_SIZE);
    const sizeAndData = joinBytes([u32(chunk.length), chunk]);
    const mac = kdbxBlockMac(hmacKey, BigInt(index), joinBytes([u64(index), sizeAndData]));
    blocks.push(mac, sizeAndData);
    if (chunk.length === 0) return joinBytes(blocks);
  }
};

/** KeePass2::ProtectedStreamAlgo ChaCha20, the inner stream the reader knows by the same ID */
const CHACHA20_STREAM = 3;

/** The inner header: ChaCha20 as the stream for protected values, its key, the end field */
const innerHeader = (streamKey: Uint8Array) =>
  joinBytes([field(1, u32(CHACHA20_STREAM)), field(2, streamKey), field(0, new Uint8Array())]);

/**
 * The vaults as a KDBX 4 database under the password, one group per vault. `now` in Unix seconds
 * for the entries' times.
 */
export const writeKdbx = async (
  vaults: readonly ExportVault[],
  password: string,
  now: number,
  { argon2, random }: KdbxWriteOptions,
): Promise<Uint8Array> => {
  if (password === "") throw new RangeError("export password must not be empty");
  const kdf: KdbxArgon2 = { kind: "argon2id", salt: random(32), version: 0x13, ...argon2 };
  const masterSeed = random(32);
  const iv = random(12);
  const streamKey = random(64);
  const head = header(masterSeed, iv, kdf);
  const groups = vaults.map((v) => ({ name: v.name, entries: v.entries.map(flatEntry) }));
  const xml = protectXml(kdbxXml(groups, random, now), (length) =>
    kdbxInnerKeystream(INNER_STREAMS[CHACHA20_STREAM] as KdbxInnerStream, streamKey, length),
  );
  const transformed = await kdbxTransformKey(kdbxCompositeKey([kdbxPasswordPart(password)]), kdf);
  // Only parameters noble refuses fail, and these are the export's own
  if (!transformed.ok) throw new RangeError("Argon2 parameters out of range");
  const keys = kdbxKeys(masterSeed, transformed.value);
  const payload = kdbxEncrypt(
    "chacha20",
    keys.cipherKey,
    iv,
    joinBytes([innerHeader(streamKey), xml]),
  );
  return joinBytes([
    head,
    sha256(head),
    kdbxBlockMac(keys.hmacKey, KDBX_HEADER_INDEX, head),
    hmacBlocks(payload, keys.hmacKey),
  ]);
};
