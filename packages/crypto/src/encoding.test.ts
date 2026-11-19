import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decode, encode, type Part } from "./encoding.ts";
import { hex } from "./test-helpers.ts";

describe("encode (F-04)", () => {
  it("writes each part as a 4-byte big-endian length and its bytes", () => {
    expect(hex(encode("ab", Uint8Array.of(1, 2, 3), 258))).toBe(
      ["00000002", "6162", "00000003", "010203", "00000008", "0000000000000102"].join(""),
    );
  });

  it("encodes nothing as nothing and an empty part as its length only", () => {
    expect(encode()).toEqual(new Uint8Array());
    expect(hex(encode(""))).toBe("00000000");
  });

  it("writes lengths past 255 and 65535 in all four bytes", () => {
    expect(hex(encode(new Uint8Array(0x10203)).subarray(0, 4))).toBe("00010203");
  });

  it("normalizes strings to NFC, so both spellings of ä are one part", () => {
    expect(encode("ä")).toEqual(encode("ä"));
    expect(hex(encode("ä"))).toBe("00000002c3a4");
  });

  it.each(["\uD800", "a\uDC00", "\uDC00\uD800"])(
    "refuses text with a lone surrogate (%#)",
    (text) => {
      expect(() => encode(text)).toThrow("not well-formed text");
    },
  );

  it("writes the largest safe integer and zero", () => {
    expect(hex(encode(Number.MAX_SAFE_INTEGER))).toBe("00000008001fffffffffffff");
    expect(hex(encode(0))).toBe("000000080000000000000000");
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])("refuses %s as a number", (n) => {
    expect(() => encode(n)).toThrow(`not a counter: ${n}`);
  });

  it("never encodes two different sequences of parts alike", () => {
    const part = fc.oneof(
      fc.uint8Array({ maxLength: 8 }),
      fc.string({ maxLength: 8 }).map((text) => text.normalize("NFC")),
      fc.nat(),
    );
    fc.assert(
      fc.property(fc.array(part, { maxLength: 4 }), fc.array(part, { maxLength: 4 }), (a, b) => {
        // Parts are untyped bytes (F-04): "" and an empty Uint8Array are the same part
        const same = (x: Part[], y: Part[]) =>
          x.length === y.length && x.every((p, i) => hex(encode(p)) === hex(encode(y[i] as Part)));
        fc.pre(!same(a, b));
        expect(hex(encode(...a))).not.toBe(hex(encode(...b)));
      }),
    );
  });
});

describe("decode", () => {
  it("gives back the parts of encode as bytes", () => {
    const parts = decode(encode("ab", Uint8Array.of(1, 2, 3), new Uint8Array()));
    expect(parts.ok && parts.value.map(hex)).toEqual(["6162", "010203", ""]);
    expect(decode(new Uint8Array())).toEqual({ ok: true, value: [] });
  });

  it("refuses a length past the end and a cut length field", () => {
    expect(decode(Uint8Array.of(0, 0, 0, 2, 1))).toEqual({ ok: false, error: "malformed" });
    expect(decode(Uint8Array.of(0, 0, 0, 1, 1, 0, 0))).toEqual({ ok: false, error: "malformed" });
  });

  it("reads parts of a view into a larger buffer", () => {
    const whole = Uint8Array.of(9, 9, ...encode("x"));
    const parts = decode(whole.subarray(2));
    expect(parts.ok && parts.value.map(hex)).toEqual(["78"]);
  });

  it("reads back every encoding (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.uint8Array({ maxLength: 20 }), { maxLength: 5 }), (parts) => {
        const decoded = decode(encode(...parts));
        expect(decoded.ok && decoded.value.map(hex)).toEqual(parts.map(hex));
      }),
    );
  });
});
