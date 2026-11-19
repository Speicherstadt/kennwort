import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DIGEST_LENGTH, digest } from "./digest.ts";
import { hex } from "./test-helpers.ts";

describe("digest", () => {
  it('is SHA-512/256 (FIPS 180-4 example "abc", and node:crypto)', () => {
    const abc = new TextEncoder().encode("abc");
    expect(hex(digest(abc))).toBe(
      "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23",
    );
    expect(hex(digest(new Uint8Array(1000).fill(7)))).toBe(
      createHash("sha512-256").update(new Uint8Array(1000).fill(7)).digest("hex"),
    );
    expect(digest(abc).length).toBe(DIGEST_LENGTH);
  });
});
