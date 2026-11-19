import { ed25519 } from "@noble/curves/ed25519.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import rfc from "../vectors/ed25519-rfc8032.json" with { type: "json" };
import vectors from "../vectors/sign-v1.json" with { type: "json" };
import { ed25519KeyPair, SIGNATURE_LENGTH, SIGNATURE_V1, sign, verify } from "./sign.ts";
import { fromHex, hex } from "./test-helpers.ts";

describe.each(rfc)("Ed25519 $name", (vector) => {
  it("derives the public key and signs as RFC 8032 says", () => {
    const { publicKey } = ed25519KeyPair(fromHex(vector.secretKey));
    expect(hex(publicKey)).toBe(vector.publicKey);
    expect(hex(ed25519.sign(fromHex(vector.message), fromHex(vector.secretKey)))).toBe(
      vector.signature,
    );
  });
});

const fieldsOf = (fields: (string | number | { hex: string })[]) =>
  fields.map((field) => (typeof field === "object" ? fromHex(field.hex) : field));

describe.each(vectors)("F-03 vector: $name (computed with libsodium)", (vector) => {
  const fields = fieldsOf(vector.fields);

  it("signs to the same signature", () => {
    expect(hex(sign(fromHex(vector.seed), vector.purpose, ...fields))).toBe(vector.signature);
  });

  it("verifies the signature", () => {
    expect(
      verify(fromHex(vector.publicKey), fromHex(vector.signature), vector.purpose, ...fields),
    ).toBe(true);
  });
});

describe("sign and verify", () => {
  const jonas = ed25519KeyPair(new Uint8Array(32).fill(4));
  const signature = sign(jonas.secretKey, "log", "vault-1", 3);

  it("writes version 1 and 64 bytes of Ed25519", () => {
    expect(signature.length).toBe(SIGNATURE_LENGTH);
    expect(signature[0]).toBe(SIGNATURE_V1);
  });

  it("refuses another purpose, other fields, another key or another version", () => {
    expect(verify(jonas.publicKey, signature, "log", "vault-1", 3)).toBe(true);
    expect(verify(jonas.publicKey, signature, "certificate", "vault-1", 3)).toBe(false);
    expect(verify(jonas.publicKey, signature, "log", "vault-1", 4)).toBe(false);
    expect(verify(ed25519KeyPair().publicKey, signature, "log", "vault-1", 3)).toBe(false);
    const other = signature.slice();
    other[0] = 0x02;
    expect(verify(jonas.publicKey, other, "log", "vault-1", 3)).toBe(false);
  });

  it("refuses a signature of the wrong length and a broken public key without throwing", () => {
    expect(verify(jonas.publicKey, signature.subarray(0, 64), "log", "vault-1", 3)).toBe(false);
    expect(verify(jonas.publicKey, new Uint8Array(66), "log", "vault-1", 3)).toBe(false);
    expect(verify(new Uint8Array(31), signature, "log", "vault-1", 3)).toBe(false);
  });

  it("refuses a non-canonical S (S + L), which ZIP-215 would also refuse but some libraries accept", () => {
    const order = 2n ** 252n + 27742317777372353535851937790883648493n;
    const s = signature.slice(33);
    const value = s.reduceRight((acc, byte) => (acc << 8n) | BigInt(byte), 0n) + order;
    const bumped = signature.slice();
    for (let i = 0; i < 32; i++) bumped[33 + i] = Number((value >> BigInt(8 * i)) & 0xffn);
    expect(verify(jonas.publicKey, bumped, "log", "vault-1", 3)).toBe(false);
  });

  it("refuses the small-order key and signature that ZIP-215 would accept for any message", () => {
    const identity = new Uint8Array(32);
    identity[0] = 1;
    const forgery = new Uint8Array(65);
    forgery.set([SIGNATURE_V1, 1]);
    expect(verify(identity, forgery, "log", "vault-1", 3)).toBe(false);
  });

  it("refuses every single flipped bit (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SIGNATURE_LENGTH - 1 }),
        fc.integer({ min: 0, max: 7 }),
        (at, bit) => {
          const changed = signature.slice();
          changed[at] = (changed[at] ?? 0) ^ (1 << bit);
          expect(verify(jonas.publicKey, changed, "log", "vault-1", 3)).toBe(false);
        },
      ),
    );
  });
});
