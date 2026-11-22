import { createCipheriv, createHmac } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bitwardenDecrypt } from "./bitwarden.ts";

const bytes = (length: number) => fc.uint8Array({ minLength: length, maxLength: length });
const keys = fc.record({ encKey: bytes(32), macKey: bytes(32) });

/** Bitwarden's encrypt-then-MAC with node:crypto, independent of the code under test */
const seal = (
  key: { encKey: Uint8Array; macKey: Uint8Array },
  iv: Uint8Array,
  plain: Uint8Array,
) => {
  const cipher = createCipheriv("aes-256-cbc", key.encKey, iv);
  const data = new Uint8Array(Buffer.concat([cipher.update(plain), cipher.final()]));
  const mac = new Uint8Array(createHmac("sha256", key.macKey).update(iv).update(data).digest());
  return { iv, data, mac };
};

describe("Bitwarden's EncString of type 2, properties", () => {
  it("opens whatever was sealed under its keys", () => {
    fc.assert(
      fc.property(keys, bytes(16), fc.uint8Array({ maxLength: 200 }), (key, iv, plain) => {
        expect(bitwardenDecrypt(key, seal(key, iv, plain))).toEqual({ ok: true, value: plain });
      }),
    );
  });

  it("refuses any changed bit of IV, ciphertext or MAC as bad-mac", () => {
    fc.assert(
      fc.property(
        keys,
        bytes(16),
        fc.uint8Array({ maxLength: 64 }),
        fc.constantFrom("iv" as const, "data" as const, "mac" as const),
        fc.nat(),
        fc.integer({ min: 0, max: 7 }),
        (key, iv, plain, part, at, bit) => {
          const sealed = seal(key, iv, plain);
          const target = sealed[part];
          const index = at % target.length;
          const changed = target.map((b, i) => (i === index ? b ^ (1 << bit) : b));
          const result = bitwardenDecrypt(key, { ...sealed, [part]: changed });
          expect(result).toEqual({ ok: false, error: "bad-mac" });
        },
      ),
    );
  });

  it("never throws on random parts of any length", () => {
    fc.assert(
      fc.property(
        keys,
        fc.uint8Array({ maxLength: 40 }),
        fc.uint8Array({ maxLength: 100 }),
        fc.uint8Array({ maxLength: 40 }),
        (key, iv, data, mac) => {
          const result = bitwardenDecrypt(key, { iv, data, mac });
          expect(result.ok).toBe(false);
        },
      ),
    );
  });
});
