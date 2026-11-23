import { describe, expect, it } from "vitest";
import { isRangePrefix, parseRange } from "./range.ts";

const suffix = (c: string) => c.repeat(35);

describe("isRangePrefix", () => {
  it.each(["5BAA6", "00000", "FFFFF", "A1B2C"])("takes %s", (prefix) => {
    expect(isRangePrefix(prefix)).toBe(true);
  });

  it.each([
    ["lower case", "5baa6"],
    ["four characters", "5BAA"],
    ["six characters", "5BAA61"],
    ["a non-hex character", "5BAG6"],
    ["the empty string", ""],
    ["a path", "5BAA6/../x"],
    ["a line break after it", "5BAA6\n"],
    ["a line break before it", "\n5BAA6"],
  ])("refuses %s", (_name, prefix) => {
    expect(isRangePrefix(prefix)).toBe(false);
  });
});

describe("parseRange", () => {
  it("reads suffix and count per line, CRLF as the API sends it", () => {
    const text = `${suffix("A")}:3\r\n${suffix("B")}:120\r\n`;
    const parsed = parseRange(text);
    expect(parsed.ok && [...parsed.value]).toEqual([
      [suffix("A"), 3],
      [suffix("B"), 120],
    ]);
  });

  it("reads LF lines and upper-cases a lower-case suffix", () => {
    const parsed = parseRange(`${suffix("a")}:7\n${suffix("1")}:1`);
    expect(parsed.ok && [...parsed.value]).toEqual([
      [suffix("A"), 7],
      [suffix("1"), 1],
    ]);
  });

  it("leaves out the padding lines with count 0 (Add-Padding: true)", () => {
    const parsed = parseRange(`${suffix("C")}:0\r\n${suffix("D")}:2\r\n${suffix("E")}:0`);
    expect(parsed.ok && [...parsed.value]).toEqual([[suffix("D"), 2]]);
  });

  it("reads an empty range as no leaks", () => {
    const parsed = parseRange("");
    expect(parsed.ok && parsed.value.size).toBe(0);
  });

  it.each([
    ["a short suffix", `${"A".repeat(34)}:3`],
    ["a long suffix", `${"A".repeat(36)}:3`],
    ["no count", suffix("A")],
    ["a negative count", `${suffix("A")}:-1`],
    ["a count with a fraction", `${suffix("A")}:1.5`],
    ["an empty count", `${suffix("A")}:`],
    ["an HTML page", "<html><body>Error</body></html>"],
    ["text after a good line", `${suffix("A")}:3\r\nnot a line`],
    ["a non-hex suffix", `${"G".repeat(35)}:3`],
    ["a blank line in the middle", `${suffix("A")}:3\r\n\r\n${suffix("B")}:1`],
    ["space before the suffix", ` ${suffix("A")}:3`],
    ["text after the count", `${suffix("A")}:3x`],
  ])("refuses %s", (_name, text) => {
    expect(parseRange(text)).toEqual({ ok: false, error: "malformed" });
  });
});
