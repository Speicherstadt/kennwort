import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DIGEST_LENGTH, digest, sha256 } from "./digest.ts";
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

describe("sha256", () => {
  const text = (value: string) => new TextEncoder().encode(value);

  // FIPS 180-4 examples (NIST CSRC, "SHA256.pdf" and "SHA2_Additional.pdf")
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("is SHA-256 of %j (FIPS 180-4)", (message, expected) => {
    expect(hex(sha256(text(message)))).toBe(expected);
  });

  it("agrees with node:crypto on a longer message", () => {
    const bytes = new Uint8Array(1000).fill(7);
    expect(hex(sha256(bytes))).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
