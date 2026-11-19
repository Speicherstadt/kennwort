import { describe, expect, it } from "vitest";
import { bytes, encodeBytes } from "./bytes.ts";

describe("bytes on the wire", () => {
  it("round-trip through base64url without padding", () => {
    for (const length of [0, 1, 2, 3, 16, 65]) {
      const value = Uint8Array.from({ length }, (_, i) => (i * 37 + 251) & 0xff);
      const text = encodeBytes(value);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(bytes().parse(text)).toEqual(value);
    }
    expect(encodeBytes(Uint8Array.of(0xfb, 0xff))).toBe("-_8");
  });

  it("names what is wrong", () => {
    const issue = (schema: ReturnType<typeof bytes>, text: string) =>
      schema.safeParse(text).error?.issues[0];
    expect(issue(bytes(), "A")).toMatchObject({ code: "custom", message: "not base64url" });
    expect(issue(bytes(16), "AAAA")).toMatchObject({
      code: "custom",
      message: "expected 16 bytes",
    });
    expect(bytes(3).safeParse("AAAA").success).toBe(true);
    expect(bytes().safeParse("a=").success).toBe(false);
  });
});
