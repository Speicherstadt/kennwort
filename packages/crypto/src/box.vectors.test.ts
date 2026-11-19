import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import vectors from "../vectors/box-v1.json" with { type: "json" };
import { boxAad, open, sealWithNonce } from "./box.ts";
import type { Part } from "./encoding.ts";
import { fromHex, hex } from "./test-helpers.ts";

// draft-irtf-cfrg-xchacha-03, Appendix A.3.1: the primitive itself, through @noble/ciphers
const draft = {
  key: "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
  nonce: "404142434445464748494a4b4c4d4e4f5051525354555657",
  aad: "50515253c0c1c2c3c4c5c6c7",
  plaintext:
    "4c616469657320616e642047656e746c656d656e206f662074686520636c617373206f66202739393a204966204920636f756c64206f6666657220796f75206f6e6c79206f6e652074697020666f7220746865206675747572652c2073756e73637265656e20776f756c642062652069742e",
  sealed:
    "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49",
};

const contextOf = (parts: (string | number | { hex: string })[]): Part[] =>
  parts.map((part) => (typeof part === "object" ? fromHex(part.hex) : part));

beforeAll(() => sodium.ready);

describe("XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha A.3.1)", () => {
  it("seals and opens the draft's vector", () => {
    const cipher = xchacha20poly1305(fromHex(draft.key), fromHex(draft.nonce), fromHex(draft.aad));
    expect(hex(cipher.encrypt(fromHex(draft.plaintext)))).toBe(draft.sealed);
    expect(hex(cipher.decrypt(fromHex(draft.sealed)))).toBe(draft.plaintext);
  });
});

describe.each(vectors)("F-01 vector: $name (computed with libsodium)", (vector) => {
  const key = fromHex(vector.key);
  const where = { purpose: vector.purpose, context: contextOf(vector.context) };

  it("binds the purpose and context into the AAD", () => {
    expect(hex(boxAad(where))).toBe(vector.aad);
  });

  it("seals to the same box", () => {
    expect(hex(sealWithNonce(key, fromHex(vector.nonce), fromHex(vector.plaintext), where))).toBe(
      vector.box,
    );
  });

  it("opens the box", () => {
    const opened = open(key, fromHex(vector.box), where);
    expect(opened.ok && hex(opened.value)).toBe(vector.plaintext);
  });

  it("is opened by libsodium as well", () => {
    const box = fromHex(vector.box);
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      box.subarray(25),
      boxAad(where),
      box.subarray(1, 25),
      key,
    );
    expect(hex(plaintext)).toBe(vector.plaintext);
  });
});
