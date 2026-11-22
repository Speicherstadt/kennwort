import { describe, expect, it } from "vitest";
import { readKdbxHeader } from "./kdbx-header.ts";
import {
  aesKdfParameters,
  argon2Parameters,
  concat,
  field,
  SIGNATURES,
  UUID,
  u32,
  u64,
  variant,
  variantMap,
  variants,
} from "./test/kdbx.ts";

const VERSION_4 = u32(0x00040000);
const SEED = new Uint8Array(32).fill(5);
const END = field(0, Uint8Array.of(13, 10, 13, 10));
const parts = {
  cipher: field(2, UUID.aes256),
  compression: field(3, u32(1)),
  masterSeed: field(4, SEED),
  iv: field(7, new Uint8Array(16).fill(6)),
  kdf: field(11, aesKdfParameters(7n)),
};
type Parts = Partial<Record<keyof typeof parts, Uint8Array | undefined>>;
/** A header with these fields replaced (`undefined` leaves one out), and bytes after it */
const header = (replaced: Parts = {}, extra: Uint8Array[] = []) => {
  const fields = Object.entries({ ...parts, ...replaced })
    .map(([, value]) => value)
    .filter((value) => value !== undefined);
  return concat(SIGNATURES, VERSION_4, ...fields, ...extra, END);
};
const read = (replaced: Parts = {}, extra: Uint8Array[] = []) =>
  readKdbxHeader(header(replaced, extra));
const kdfOf = (...items: Uint8Array[]) => read({ kdf: field(11, variantMap(...items)) });
const error = (e: string) => ({ ok: false, error: e });
const argon2 = (overrides: Record<string, Uint8Array | undefined>) => {
  const items: Record<string, Uint8Array | undefined> = {
    uuid: variants.bytes("$UUID", UUID.argon2id),
    salt: variants.bytes("S", new Uint8Array(8).fill(1)),
    lanes: variants.u32("P", 2),
    memory: variants.u64("M", 8n * 1024n),
    passes: variants.u64("I", 3n),
    version: variants.u32("V", 0x13),
    ...overrides,
  };
  return kdfOf(...Object.values(items).filter((item) => item !== undefined));
};

describe("KDBX 4 header", () => {
  it("reads cipher, compression, seed, IV, KDF and where it ends", () => {
    const bytes = header();
    expect(readKdbxHeader(concat(bytes, new Uint8Array(64)))).toEqual({
      ok: true,
      value: {
        cipher: "aes256",
        compressed: true,
        masterSeed: SEED,
        iv: new Uint8Array(16).fill(6),
        kdf: { kind: "aes", seed: new Uint8Array(32).fill(0x4b), rounds: 7 },
        end: bytes.length,
      },
    });
  });

  it("reads ChaCha20 with its 12-byte IV, uncompressed", () => {
    const result = read({
      cipher: field(2, UUID.chacha20),
      iv: field(7, new Uint8Array(12)),
      compression: field(3, u32(0)),
    });
    expect(result.ok && [result.value.cipher, result.value.compressed]).toEqual([
      "chacha20",
      false,
    ]);
  });

  it("checks the signatures and the version", () => {
    const withStart = (start: Uint8Array) => readKdbxHeader(concat(start, header().subarray(12)));
    expect(withStart(concat(u32(0x9aa2d904), u32(0xb54bfb67), VERSION_4))).toEqual(
      error("wrong-format"),
    );
    expect(withStart(concat(u32(0x9aa2d903), u32(0xb54bfb66), VERSION_4))).toEqual(
      error("wrong-format"),
    );
    expect(withStart(concat(u32(0x9aa2d903), u32(0xb54bfb65), VERSION_4))).toEqual(
      error("unsupported"),
    );
    expect(withStart(concat(SIGNATURES, u32(0x00030001)))).toEqual(error("unsupported"));
    expect(withStart(concat(SIGNATURES, u32(0x00050000)))).toEqual(error("unsupported"));
    expect(withStart(concat(SIGNATURES, u32(0x0004ffff))).ok).toBe(true);
    expect(readKdbxHeader(SIGNATURES)).toEqual(error("unsupported"));
    expect(readKdbxHeader(SIGNATURES.subarray(0, 7))).toEqual(error("wrong-format"));
    expect(readKdbxHeader(new Uint8Array())).toEqual(error("wrong-format"));
  });

  it("skips comments and unknown fields, and refuses KDBX 3's legacy fields", () => {
    expect(read({}, [field(1, Uint8Array.of(1, 2)), field(99, new Uint8Array())]).ok).toBe(true);
    for (const legacy of [5, 6, 8, 9, 10]) {
      expect(read({}, [field(legacy, new Uint8Array(4))])).toEqual(error("bad-kdbx"));
    }
  });

  it("refuses a header cut anywhere", () => {
    const bytes = header();
    for (const length of [12, 13, 16, 20, bytes.length - 5, bytes.length - 1]) {
      expect(readKdbxHeader(bytes.subarray(0, length))).toEqual(error("bad-kdbx"));
    }
  });

  it("checks the cipher, the compression, the seed and the IV", () => {
    expect(read({ cipher: undefined })).toEqual(error("bad-kdbx"));
    expect(read({ cipher: field(2, UUID.aes256.subarray(1)) })).toEqual(error("bad-kdbx"));
    expect(read({ cipher: field(2, UUID.twofish) })).toEqual(error("unsupported"));
    expect(read({ compression: undefined })).toEqual(error("bad-kdbx"));
    expect(read({ compression: field(3, u32(1).subarray(1)) })).toEqual(error("bad-kdbx"));
    expect(read({ compression: field(3, u32(2)) })).toEqual(error("unsupported"));
    expect(read({ masterSeed: undefined })).toEqual(error("bad-kdbx"));
    expect(read({ masterSeed: field(4, new Uint8Array(31)) })).toEqual(error("bad-kdbx"));
    expect(read({ iv: undefined })).toEqual(error("bad-kdbx"));
    expect(read({ iv: field(7, new Uint8Array(12)) })).toEqual(error("bad-kdbx"));
    expect(read({ kdf: undefined })).toEqual(error("bad-kdbx"));
  });
});

describe("KDBX 4 KDF parameters", () => {
  it("reads Argon2id and Argon2d with memory in whole KiB", () => {
    expect(argon2({ memory: variants.u64("M", 8n * 1024n + 1023n) })).toMatchObject({
      ok: true,
      value: {
        kdf: {
          kind: "argon2id",
          salt: new Uint8Array(8).fill(1),
          parallelism: 2,
          memoryKiB: 8,
          iterations: 3,
          version: 0x13,
        },
      },
    });
    const d = argon2({
      uuid: variants.bytes("$UUID", UUID.argon2d),
      version: variants.u32("V", 0x10),
    });
    expect(d.ok && d.value.kdf).toMatchObject({ kind: "argon2d", version: 0x10 });
    const fromHelper = kdfOf();
    expect(fromHelper).toEqual(error("bad-kdbx"));
    expect(readKdbxHeader(header({ kdf: field(11, argon2Parameters()) })).ok).toBe(true);
  });

  it("keeps each Argon2 parameter within KeePassXC's range", () => {
    const bad = error("bad-kdbx");
    const cases: [string, Uint8Array | undefined, boolean][] = [
      ["salt", variants.bytes("S", new Uint8Array(7)), false],
      ["salt", variants.bytes("S", new Uint8Array(32)), true],
      ["salt", variants.bytes("S", new Uint8Array(33)), false],
      ["salt", variants.u32("S", 8), false],
      ["salt", undefined, false],
      ["lanes", variants.u32("P", 0), false],
      ["lanes", variants.u32("P", 2 ** 24 - 1), true],
      ["lanes", variants.u32("P", 2 ** 24), false],
      ["lanes", variant(0x0c, "P", Uint8Array.of(0xff, 0xff, 0xff, 0xff)), false],
      ["lanes", undefined, false],
      ["memory", variants.u64("M", 8191n), false],
      ["memory", variants.u64("M", 2n ** 42n - 1n), true],
      ["memory", variants.u64("M", 2n ** 42n), false],
      ["memory", undefined, false],
      ["passes", variants.u64("I", 0n), false],
      ["passes", variants.u64("I", 2n ** 31n - 2n), true],
      ["passes", variants.u64("I", 2n ** 31n - 1n), false],
      ["passes", variants.bytes("I", new Uint8Array(8)), false],
      ["passes", variants.bytes("I", Uint8Array.of(3)), false],
      ["lanes", variant(0x0c, "P", u32(2)), true],
      ["salt", variant(0x18, "S", new TextEncoder().encode("Weber-Salz")), true],
      ["salt", variant(0x08, "S", Uint8Array.of(1)), false],
      ["passes", undefined, false],
      ["version", variants.u32("V", 0x0f), false],
      ["version", variants.u32("V", 0x14), false],
      ["version", undefined, false],
    ];
    for (const [name, item, fine] of cases) {
      const result = argon2({ [name]: item });
      expect([name, result.ok ? "ok" : result]).toEqual([name, fine ? "ok" : bad]);
    }
  });

  it("calls the Argon2 versions noble does not compute unsupported", () => {
    for (const version of [0x11, 0x12]) {
      expect(argon2({ version: variants.u32("V", version) })).toEqual(error("unsupported"));
    }
  });

  it("reads AES-KDF under both UUIDs, its seed an AES-256 key", () => {
    const aes = (uuid: Uint8Array, rounds: Uint8Array, seed: Uint8Array) =>
      kdfOf(variants.bytes("$UUID", uuid), rounds, variants.bytes("S", seed));
    const result = aes(UUID.aesKdf3, variants.u32("R", 9), SEED);
    expect(result.ok && result.value.kdf).toEqual({ kind: "aes", seed: SEED, rounds: 9 });
    expect(aes(UUID.aesKdf, variants.u64("R", 2n ** 31n - 2n), SEED).ok).toBe(true);
    expect(aes(UUID.aesKdf, variants.u64("R", 2n ** 31n - 1n), SEED)).toEqual(error("bad-kdbx"));
    expect(aes(UUID.aesKdf, variants.u64("R", 2n ** 64n - 1n), SEED)).toEqual(error("bad-kdbx"));
    expect(aes(UUID.aesKdf, variants.u64("R", 0n), SEED)).toEqual(error("bad-kdbx"));
    expect(aes(UUID.aesKdf, variant(0x0d, "R", u64(5n)), SEED).ok).toBe(true);
    expect(aes(UUID.aesKdf, variants.u64("R", 1n), SEED.subarray(1))).toEqual(error("bad-kdbx"));
    expect(kdfOf(variants.bytes("$UUID", UUID.aesKdf), variants.bytes("S", SEED))).toEqual(
      error("bad-kdbx"),
    );
  });

  it("knows its KDFs by UUID", () => {
    expect(kdfOf(variants.bytes("$UUID", UUID.aes256))).toEqual(error("unsupported"));
    expect(kdfOf(variants.bytes("$UUID", UUID.aesKdf.subarray(1)))).toEqual(error("bad-kdbx"));
    expect(kdfOf(variants.u32("$UUID", 1))).toEqual(error("bad-kdbx"));
  });

  it("reads every type of the VariantDictionary and checks its length", () => {
    const aes = [
      variants.bytes("$UUID", UUID.aesKdf),
      variants.u64("R", 3n),
      variants.bytes("S", SEED),
    ];
    const others = [
      variant(0x08, "B", Uint8Array.of(1)),
      variant(0x08, "b", Uint8Array.of(0)),
      variant(0x0c, "i", u32(1)),
      variant(0x0d, "l", u64(1n)),
      variant(0x18, "s", new TextEncoder().encode("Weber")),
      variants.u32("u", 1),
    ];
    expect(kdfOf(...others, ...aes).ok).toBe(true);
    for (const type of [0x04, 0x05, 0x08, 0x0c, 0x0d]) {
      expect(kdfOf(variant(type, "x", new Uint8Array(3)), ...aes)).toEqual(error("bad-kdbx"));
    }
    expect(kdfOf(variant(0x07, "x", new Uint8Array(4)), ...aes)).toEqual(error("bad-kdbx"));
  });

  it("checks the VariantDictionary's version and length", () => {
    const map = aesKdfParameters();
    const withVersion = (high: number, low: number) => {
      const copy = map.slice();
      copy[0] = low;
      copy[1] = high;
      return read({ kdf: field(11, copy) });
    };
    expect(withVersion(0x01, 0xff).ok).toBe(true);
    expect(withVersion(0x00, 0x00).ok).toBe(true);
    expect(withVersion(0x02, 0x00)).toEqual(error("unsupported"));
    for (const length of [0, 1, 2, 3, 8, map.length - 1]) {
      expect(read({ kdf: field(11, map.subarray(0, length)) })).toEqual(error("bad-kdbx"));
    }
  });
});
