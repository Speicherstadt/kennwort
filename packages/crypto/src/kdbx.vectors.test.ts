import { describe, expect, it } from "vitest";
import vectors from "../vectors/kdbx-4.json" with { type: "json" };
import {
  KDBX_HEADER_INDEX,
  type KdbxArgon2,
  kdbxBlockMac,
  kdbxCompositeKey,
  kdbxDecrypt,
  kdbxInnerKeystream,
  kdbxKeys,
  kdbxPasswordPart,
  kdbxTransformKey,
} from "./kdbx.ts";
import { fromHex, hex } from "./test-helpers.ts";

// Vectors computed with hashlib, pycryptodome and argon2-cffi (vectors/generate-kdbx.py)
const composite = fromHex(vectors.composite.composite);

describe("KDBX 4 composite key", () => {
  it("hashes the password's UTF-8 with SHA-256", () => {
    expect(hex(kdbxPasswordPart(vectors.composite.password))).toBe(vectors.composite.passwordPart);
  });

  it("hashes the parts in order", () => {
    const parts = [fromHex(vectors.composite.passwordPart), fromHex(vectors.composite.keyFile)];
    expect(hex(kdbxCompositeKey(parts))).toBe(vectors.composite.composite);
    expect(hex(kdbxCompositeKey(parts.toReversed()))).not.toBe(vectors.composite.composite);
  });
});

describe("KDBX 4 key derivation", () => {
  it.each(vectors.aesKdf)("AES-KDF with $rounds rounds", async ({ seed, rounds, transformed }) => {
    const result = await kdbxTransformKey(composite, { kind: "aes", seed: fromHex(seed), rounds });
    expect(result.ok && hex(result.value)).toBe(transformed);
  });

  it("leaves the composite key as it was", async () => {
    const before = hex(composite);
    await kdbxTransformKey(composite, { kind: "aes", seed: new Uint8Array(32), rounds: 3 });
    expect(hex(composite)).toBe(before);
  });

  it("gives the event loop a turn while AES-KDF runs", async () => {
    let turned = false;
    setTimeout(() => {
      turned = true;
    }, 0);
    await kdbxTransformKey(composite, { kind: "aes", seed: new Uint8Array(32), rounds: 1 });
    expect(turned).toBe(true);
  });

  it.each(vectors.argon2.cases)(
    "$kind version $version, t=$iterations, m=$memoryKiB KiB, p=$parallelism",
    async ({ transformed, ...params }) => {
      const kdf = { ...params, salt: fromHex(vectors.argon2.salt) } as KdbxArgon2;
      const result = await kdbxTransformKey(composite, kdf);
      expect(result.ok && hex(result.value)).toBe(transformed);
    },
  );

  it("refuses parameters Argon2 does not allow", async () => {
    const kdf: KdbxArgon2 = {
      kind: "argon2id",
      salt: fromHex(vectors.argon2.salt),
      iterations: 1,
      memoryKiB: 4,
      parallelism: 1,
      version: 0x13,
    };
    expect(await kdbxTransformKey(composite, kdf)).toEqual({ ok: false, error: "bad-kdf" });
  });
});

describe("KDBX 4 keys and HMAC", () => {
  const { cipherKey, hmacKey } = kdbxKeys(
    fromHex(vectors.keys.masterSeed),
    fromHex(vectors.keys.transformed),
  );

  it("derives the cipher key and the HMAC base key", () => {
    expect(hex(cipherKey)).toBe(vectors.keys.cipherKey);
    expect(hex(hmacKey)).toBe(vectors.keys.hmacKey);
  });

  it.each(vectors.keys.macs)("authenticates block $index under its own key", ({ index, mac }) => {
    expect(hex(kdbxBlockMac(hmacKey, BigInt(index), fromHex(vectors.keys.block)))).toBe(mac);
  });

  it("uses the last index for the header", () => {
    expect(KDBX_HEADER_INDEX).toBe(18446744073709551615n);
  });
});

describe("KDBX 4 payload", () => {
  const key = fromHex(vectors.payload.key);
  const { aes256, chacha20 } = vectors.payload;

  it("decrypts AES-256-CBC and drops the padding", () => {
    const result = kdbxDecrypt("aes256", key, fromHex(aes256.iv), fromHex(aes256.ciphertext));
    expect(result.ok && hex(result.value)).toBe(vectors.payload.plaintext);
  });

  it("decrypts ChaCha20", () => {
    const result = kdbxDecrypt("chacha20", key, fromHex(chacha20.iv), fromHex(chacha20.ciphertext));
    expect(result.ok && hex(result.value)).toBe(vectors.payload.plaintext);
  });

  it("answers broken padding with an error, not an exception", () => {
    const cut = fromHex(aes256.ciphertext).subarray(0, 32);
    expect(kdbxDecrypt("aes256", new Uint8Array(32), fromHex(aes256.iv), cut)).toEqual({
      ok: false,
      error: "bad-payload",
    });
    expect(kdbxDecrypt("aes256", key, fromHex(aes256.iv), new Uint8Array(15))).toEqual({
      ok: false,
      error: "bad-payload",
    });
  });
});

describe("KDBX 4 inner stream", () => {
  const key = fromHex(vectors.innerStream.key);

  it.each(["salsa20", "chacha20"] as const)("gives %s's keystream", (stream) => {
    expect(hex(kdbxInnerKeystream(stream, key, 150))).toBe(vectors.innerStream[stream]);
    expect(hex(kdbxInnerKeystream(stream, key, 7))).toBe(vectors.innerStream[stream].slice(0, 14));
  });
});
