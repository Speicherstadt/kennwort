import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { kdbxBlockMac, kdbxDecrypt, kdbxInnerKeystream } from "./kdbx.ts";

const bytes = (length: number) => fc.uint8Array({ minLength: length, maxLength: length });

describe("KDBX 4 building blocks, properties", () => {
  it("runs the inner stream on: a shorter keystream is the start of a longer one", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("salsa20" as const, "chacha20" as const),
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.nat({ max: 300 }),
        fc.nat({ max: 300 }),
        (stream, key, a, b) => {
          const [short, long] = [Math.min(a, b), Math.max(a, b)];
          const prefix = kdbxInnerKeystream(stream, key, long).subarray(0, short);
          expect(kdbxInnerKeystream(stream, key, short)).toEqual(prefix);
        },
      ),
    );
  });

  it("undoes ChaCha20 by applying it again", () => {
    fc.assert(
      fc.property(bytes(32), bytes(12), fc.uint8Array({ maxLength: 300 }), (key, iv, data) => {
        const once = kdbxDecrypt("chacha20", key, iv, data);
        if (!once.ok) throw new Error("ChaCha20 does not fail");
        const twice = kdbxDecrypt("chacha20", key, iv, once.value);
        expect(twice.ok && twice.value).toEqual(data);
      }),
    );
  });

  it("never throws on AES-256-CBC input of any length", () => {
    fc.assert(
      fc.property(bytes(32), bytes(16), fc.uint8Array({ maxLength: 100 }), (key, iv, data) => {
        const result = kdbxDecrypt("aes256", key, iv, data);
        expect(result.ok || result.error === "bad-payload").toBe(true);
      }),
    );
  });

  it("gives every block index its own HMAC", () => {
    fc.assert(
      fc.property(bytes(64), fc.bigInt({ min: 0n, max: 2n ** 64n - 2n }), (key, index) => {
        const data = Uint8Array.of(1, 2, 3);
        expect(kdbxBlockMac(key, index, data)).not.toEqual(kdbxBlockMac(key, index + 1n, data));
      }),
    );
  });
});
