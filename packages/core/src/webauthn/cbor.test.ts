import { describe, expect, it } from "vitest";
import { cbor } from "./cbor.ts";

// RFC 8949, appendix A: the examples of the items Kennwort writes
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("cbor (RFC 8949, appendix A)", () => {
  it.each([
    [0, "00"],
    [1, "01"],
    [10, "0a"],
    [23, "17"],
    [24, "1818"],
    [25, "1819"],
    [100, "1864"],
    [255, "18ff"],
    [256, "190100"],
    [1000, "1903e8"],
    [65535, "19ffff"],
    [65536, "1a00010000"],
    [1000000, "1a000f4240"],
    [0xffff_ffff, "1affffffff"],
    [-1, "20"],
    [-7, "26"],
    [-10, "29"],
    [-24, "37"],
    [-25, "3818"],
    [-100, "3863"],
    [-1000, "3903e7"],
  ])("integer %d", (value, expected) => {
    expect(hex(cbor(value))).toBe(expected);
  });

  it("writes text as UTF-8 and bytes as they are", () => {
    expect(hex(cbor(""))).toBe("60");
    expect(hex(cbor("a"))).toBe("6161");
    expect(hex(cbor("IETF"))).toBe("6449455446");
    expect(hex(cbor("ü"))).toBe("62c3bc");
    expect(hex(cbor("水"))).toBe("63e6b0b4");
    expect(hex(cbor(new Uint8Array(0)))).toBe("40");
    expect(hex(cbor(Uint8Array.of(1, 2, 3, 4)))).toBe("4401020304");
    expect(hex(cbor(new Uint8Array(24)))).toBe(`5818${"00".repeat(24)}`);
    expect(hex(cbor(new Uint8Array(300)))).toBe(`59012c${"00".repeat(300)}`);
  });

  it("writes maps in the order given", () => {
    expect(hex(cbor([]))).toBe("a0");
    expect(
      hex(
        cbor([
          [1, 2],
          [3, 4],
        ]),
      ),
    ).toBe("a201020304");
    expect(
      hex(
        cbor([
          ["a", 1],
          ["b", [["c", "d"]]],
        ]),
      ),
    ).toBe("a26161016162a161636164");
  });

  it("refuses what it cannot write", () => {
    expect(() => cbor(0x1_0000_0000)).toThrow("CBOR argument out of range");
    expect(() => cbor(-0x1_0000_0001)).toThrow(RangeError);
    expect(() => cbor(1.5)).toThrow(RangeError);
    expect(() => cbor(Number.NaN)).toThrow(RangeError);
  });
});
