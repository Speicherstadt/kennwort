import { hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEqual, keyCommitment } from "./commitment.ts";
import { encode } from "./encoding.ts";
import { hex } from "./test-helpers.ts";

describe("keyCommitment", () => {
  const key = new Uint8Array(32).fill(8);

  it("is HKDF-SHA-512 of the key with the key-commit label (node:crypto)", () => {
    const info = encode("kennwort/key-commit/v1", "vault-key", "v", 2);
    const expected = new Uint8Array(hkdfSync("sha512", key, new Uint8Array(), info, 32));
    expect(hex(keyCommitment(key, "vault-key", "v", 2))).toBe(hex(expected));
  });
});

describe("constantTimeEqual", () => {
  it("is true only for equal bytes of equal length", () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(constantTimeEqual(Uint8Array.of(0, 2), Uint8Array.of(1, 2))).toBe(false);
    expect(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 0))).toBe(false);
    expect(constantTimeEqual(Uint8Array.of(1, 2, 0), Uint8Array.of(1, 2))).toBe(false);
    expect(constantTimeEqual(new Uint8Array(), new Uint8Array())).toBe(true);
  });
});
