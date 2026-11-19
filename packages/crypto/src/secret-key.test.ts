import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatSecretKey, parseSecretKey } from "./secret-key.ts";

const zero = new Uint8Array(16);
const ones = new Uint8Array(16).fill(0xff);

describe("formatSecretKey", () => {
  it("writes K1-, 26 Crockford Base32 digits in groups of five and a check symbol", () => {
    expect(formatSecretKey(zero)).toBe("K1-00000-00000-00000-00000-00000-0-0");
    // 2^128 − 1 = 7 followed by 25 Z; 2^128 − 1 mod 37 = 0 → check symbol "0"
    expect(formatSecretKey(ones)).toBe(
      `K1-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-Z-${"0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U"[Number((2n ** 128n - 1n) % 37n)]}`,
    );
  });

  it("refuses a key that is not 16 bytes", () => {
    expect(() => formatSecretKey(new Uint8Array(15))).toThrow("key must be 16 bytes");
  });
});

describe("parseSecretKey", () => {
  it("reads back every key it wrote (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (key) => {
        expect(parseSecretKey(formatSecretKey(key))).toEqual({ ok: true, value: key });
      }),
    );
  });

  it("ignores case, spaces and hyphens and reads O as 0, I and L as 1", () => {
    const key = Uint8Array.from({ length: 16 }, (_, i) => i * 17);
    const text = formatSecretKey(key);
    const sloppy = text.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
    expect(parseSecretKey(sloppy)).toEqual({ ok: true, value: key });
    expect(parseSecretKey(text.replace(/1/g, "I"))).toEqual({ ok: true, value: key });
  });

  it("names what is wrong", () => {
    const text = formatSecretKey(zero);
    expect(parseSecretKey(text.replace("K1", "K2"))).toEqual({ ok: false, error: "wrong-prefix" });
    expect(parseSecretKey(text.slice(0, -2))).toEqual({ ok: false, error: "wrong-length" });
    expect(parseSecretKey(`${text}0`)).toEqual({ ok: false, error: "wrong-length" });
    expect(parseSecretKey(text.replace("00000-0-0", "0000U-0-0"))).toEqual({
      ok: false,
      error: "invalid-character",
    });
    expect(parseSecretKey("K1-80000-00000-00000-00000-00000-0-0")).toEqual({
      ok: false,
      error: "invalid-character",
    });
    expect(parseSecretKey(text.replace(/-0$/, "-1"))).toEqual({ ok: false, error: "wrong-check" });
    // A character outside the alphabet among digits that stay in range must not count as a digit
    const high = formatSecretKey(ones);
    expect(parseSecretKey(`${high.slice(0, -5)}U${high.slice(-4)}`)).toEqual({
      ok: false,
      error: "invalid-character",
    });
    expect(parseSecretKey(`K1-1*${high.slice(5)}`)).toEqual({
      ok: false,
      error: "invalid-character",
    });
  });

  it("catches every single changed digit with the check symbol (property)", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 16, maxLength: 16 }),
        fc.integer({ min: 3, max: 33 }),
        fc.integer({ min: 1, max: 31 }),
        (key, at, shift) => {
          const text = formatSecretKey(key);
          fc.pre(text[at] !== "-");
          const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
          const changed = alphabet[(alphabet.indexOf(text[at] ?? "0") + shift) % 32] ?? "0";
          const result = parseSecretKey(text.slice(0, at) + changed + text.slice(at + 1));
          expect(result.ok).toBe(false);
        },
      ),
    );
  });
});
