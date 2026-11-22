/**
 * Building KDBX 4 databases for the reader's tests with node:crypto and node:zlib, so the reader is
 * checked against another implementation, after the layout of KeePassXC's Kdbx4Writer and
 * HmacBlockStream: header fields, its SHA-256 and HMAC, HMAC blocks of the encrypted payload, the
 * inner header and the XML. Every part can be replaced, so a test can break one on purpose. The
 * KDF is AES-KDF with one round, so building is cheap.
 */
import { createCipheriv, createHash, createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";

const encoder = new TextEncoder();
export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const bytes = (data: Buffer) => new Uint8Array(data);
const sha256 = (...data: Uint8Array[]) =>
  bytes(
    createHash("sha256")
      .update(concat(...data))
      .digest(),
  );
const sha512 = (...data: Uint8Array[]) =>
  bytes(
    createHash("sha512")
      .update(concat(...data))
      .digest(),
  );
export const u32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
};
export const u64 = (value: bigint) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
};
export const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));

/** A type-length-value field of the header or the inner header */
export const field = (id: number, value: Uint8Array) =>
  concat(Uint8Array.of(id), u32(value.length), value);

/** One VariantDictionary item (KeePass2::VariantMapFieldType) */
export const variant = (type: number, name: string, value: Uint8Array) =>
  concat(Uint8Array.of(type), u32(name.length), encoder.encode(name), u32(value.length), value);
export const variants = {
  u32: (name: string, value: number) => variant(0x04, name, u32(value)),
  u64: (name: string, value: bigint) => variant(0x05, name, u64(value)),
  bytes: (name: string, value: Uint8Array) => variant(0x42, name, value),
};
/** A VariantDictionary of version 1.0 with these items */
export const variantMap = (...items: Uint8Array[]) =>
  concat(Uint8Array.of(0x00, 0x01), ...items, Uint8Array.of(0));

export const UUID = {
  aes256: fromHex("31c1f2e6bf714350be5805216afc5aff"),
  chacha20: fromHex("d6038a2b8b6f4cb5a524339a31dbb59a"),
  twofish: fromHex("ad68f29f576f4bb9a36ad47af965346c"),
  argon2d: fromHex("ef636ddf8c29444b91f7a9a403e30a0c"),
  argon2id: fromHex("9e298b1956db4773b23dfc3ec6f0a1e6"),
  aesKdf: fromHex("7c02bb8279a74ac0927d114a00648238"),
  aesKdf3: fromHex("c9d9f39a628a4460bf740d08c18a4fea"),
};

const SEED = new Uint8Array(32).fill(0x4b);
export const aesKdfParameters = (rounds = 1n, seed = SEED) =>
  variantMap(
    variants.bytes("$UUID", UUID.aesKdf),
    variants.u64("R", rounds),
    variants.bytes("S", seed),
  );
export const argon2Parameters = (
  options: { uuid?: Uint8Array; memory?: bigint; iterations?: bigint; version?: number } = {},
) =>
  variantMap(
    variants.bytes("$UUID", options.uuid ?? UUID.argon2d),
    variants.bytes("S", new Uint8Array(32).fill(1)),
    variants.u32("P", 1),
    variants.u64("M", options.memory ?? 64n * 1024n),
    variants.u64("I", options.iterations ?? 1n),
    variants.u32("V", options.version ?? 0x13),
  );

export const SIGNATURES = concat(u32(0x9aa2d903), u32(0xb54bfb67));
const VERSION_4_1 = u32(0x00040001);

export type HeaderFields = Record<
  "cipher" | "compression" | "masterSeed" | "iv" | "kdf" | "end",
  Uint8Array
>;

export type KdbxSpec = {
  /** The password, or `null` for none */
  password?: string | null;
  /** The key file's 32-byte key, after the password */
  keyFile?: Uint8Array;
  cipher?: "aes256" | "chacha20";
  compress?: boolean;
  /** The XML; `protect` hides a value with the inner stream (ChaCha20), in call order */
  xml?: (protect: (value: string) => string) => string;
  /** The inner header's fields instead of ChaCha20 with its key */
  inner?: Uint8Array;
  /** The whole plain payload instead of inner header and XML */
  payload?: Uint8Array;
  /** The header's fields after the version, end field included */
  fields?: (defaults: HeaderFields) => Uint8Array[];
  /** Bytes the cipher encrypts instead of the (packed) payload */
  encrypted?: (plain: Uint8Array) => Uint8Array;
  blockSize?: number;
  /** Encrypt without PKCS#7 padding, so the bytes decide what the last block's padding is */
  noPadding?: boolean;
};

const MASTER_SEED = new Uint8Array(32).fill(0x11);
const IV = { aes256: new Uint8Array(16).fill(0x22), chacha20: new Uint8Array(12).fill(0x33) };
const INNER_KEY = new Uint8Array(64).fill(0x44);

/** ChaCha20 under SHA-512(key): key and nonce, with node's 16-byte IV of counter 0 and nonce */
const chacha = (key: Uint8Array, nonce: Uint8Array) =>
  createCipheriv("chacha20", key, concat(u32(0), nonce));

const innerProtector = () => {
  const keyNonce = sha512(INNER_KEY);
  const stream = chacha(keyNonce.subarray(0, 32), keyNonce.subarray(32, 44));
  return (value: string) => Buffer.from(stream.update(encoder.encode(value))).toString("base64");
};

export const DEFAULT_XML = (protect: (value: string) => string) =>
  `<KeePassFile><Root><Group><Name>Weber Haustechnik</Name><Entry>` +
  `<String><Key>Title</Key><Value>Router Lager</Value></String>` +
  `<String><Key>Password</Key><Value Protected="True">${protect("Lager&Router-2026")}</Value></String>` +
  `</Entry></Group></Root></KeePassFile>`;

/** The default inner header: ChaCha20 (3) with its key */
export const INNER = concat(field(1, u32(3)), field(2, INNER_KEY), field(0, new Uint8Array()));

const encrypt = (
  cipher: "aes256" | "chacha20",
  key: Uint8Array,
  plain: Uint8Array,
  padding: boolean,
) => {
  const c =
    cipher === "aes256"
      ? createCipheriv("aes-256-cbc", key, IV.aes256).setAutoPadding(padding)
      : chacha(key, IV.chacha20);
  return concat(bytes(c.update(plain)), bytes(c.final()));
};

/** AES-KDF, one round, on node's AES-256-ECB */
const transform = (composite: Uint8Array) => {
  const ecb = createCipheriv("aes-256-ecb", SEED, null).setAutoPadding(false);
  return sha256(bytes(ecb.update(composite)));
};

const blockMac = (hmacKey: Uint8Array, index: bigint, data: Uint8Array) =>
  bytes(
    createHmac("sha256", sha512(u64(index), hmacKey))
      .update(data)
      .digest(),
  );

export type BuiltKdbx = { bytes: Uint8Array; headerEnd: number; payloadLength: number };

export const buildKdbx = (spec: KdbxSpec = {}): BuiltKdbx => {
  const cipher = spec.cipher ?? "aes256";
  const compress = spec.compress ?? true;
  const defaults: HeaderFields = {
    cipher: field(2, UUID[cipher]),
    compression: field(3, u32(compress ? 1 : 0)),
    masterSeed: field(4, MASTER_SEED),
    iv: field(7, IV[cipher]),
    kdf: field(11, aesKdfParameters()),
    end: field(0, encoder.encode("\r\n\r\n")),
  };
  const header = concat(
    SIGNATURES,
    VERSION_4_1,
    ...(spec.fields?.(defaults) ?? Object.values(defaults)),
  );
  const password = spec.password === null ? [] : [sha256(encoder.encode(spec.password ?? "Weber"))];
  const composite = sha256(...password, ...(spec.keyFile ? [spec.keyFile] : []));
  const transformed = transform(composite);
  const cipherKey = sha256(MASTER_SEED, transformed);
  const hmacKey = sha512(MASTER_SEED, transformed, Uint8Array.of(1));
  const xml = encoder.encode((spec.xml ?? DEFAULT_XML)(innerProtector()));
  const payload = spec.payload ?? concat(spec.inner ?? INNER, xml);
  const packed = compress ? new Uint8Array(gzipSync(payload)) : payload;
  const encrypted = encrypt(cipher, cipherKey, spec.encrypted?.(packed) ?? packed, !spec.noPadding);
  const size = spec.blockSize ?? 1024 * 1024;
  const blocks: Uint8Array[] = [];
  for (let at = 0, index = 0n; ; at += size, index++) {
    const data = encrypted.subarray(at, at + size);
    const head = u32(data.length);
    blocks.push(blockMac(hmacKey, index, concat(u64(index), head, data)), head, data);
    if (data.length === 0) break;
  }
  return {
    bytes: concat(header, sha256(header), blockMac(hmacKey, 2n ** 64n - 1n, header), ...blocks),
    headerEnd: header.length,
    payloadLength: payload.length,
  };
};
