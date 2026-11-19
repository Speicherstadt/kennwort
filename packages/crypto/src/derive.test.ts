import { hkdfSync } from "node:crypto";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DERIVED_LENGTH, kdf } from "./derive.ts";
import { encode } from "./encoding.ts";
import { fromHex, hex } from "./test-helpers.ts";

// RFC 5869, Appendix A, test cases 1 to 3 (it has no SHA-512 vectors; kdf is checked against node:crypto)
const rfc5869 = [
  {
    ikm: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
    salt: "000102030405060708090a0b0c",
    info: "f0f1f2f3f4f5f6f7f8f9",
    length: 42,
    okm: "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
  },
  {
    ikm: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f",
    salt: "606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
    info: "b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
    length: 82,
    okm: "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87",
  },
  {
    ikm: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
    salt: "",
    info: "",
    length: 42,
    okm: "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8",
  },
];

describe.each(rfc5869.map((vector, index) => ({ index: index + 1, ...vector })))(
  "HKDF RFC 5869 test case $index",
  (vector) => {
    it("derives the RFC's output key material", () => {
      const okm = hkdf(
        sha256,
        fromHex(vector.ikm),
        fromHex(vector.salt),
        fromHex(vector.info),
        vector.length,
      );
      expect(hex(okm)).toBe(vector.okm);
    });
  },
);

describe("kdf (F-04)", () => {
  it("is HKDF-SHA-512 with info = enc(purpose, context…) and 32 bytes, as node:crypto computes it", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.uint8Array({ maxLength: 32 }),
        fc.string({ maxLength: 10 }),
        fc.nat(),
        (ikm, salt, purpose, counter) => {
          const expected = hkdfSync("sha512", ikm, salt, encode(purpose, counter), DERIVED_LENGTH);
          expect(hex(kdf(ikm, salt, purpose, counter))).toBe(hex(new Uint8Array(expected)));
        },
      ),
      { numRuns: 50 },
    );
  });
});
