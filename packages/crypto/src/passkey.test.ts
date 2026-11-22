import { createPublicKey, verify } from "node:crypto";
import { p256 } from "@noble/curves/nist.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/passkey-v1.json" with { type: "json" };
import {
  ES256,
  newPasskeyKey,
  PASSKEY_KEY_LENGTH,
  PASSKEY_KEY_V1,
  PASSKEY_SCALAR_LENGTH,
  passkeyPublicKey,
  passkeySign,
} from "./passkey.ts";
import { fromHex, hex } from "./test-helpers.ts";

// F-12: the private key of a passkey (K-406), ES256 on P-256 through @noble/curves
const spki = (point: Uint8Array) =>
  createPublicKey({
    key: Buffer.concat([
      Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
      Buffer.from(point),
    ]),
    format: "der",
    type: "spki",
  });

const publicOf = (key: Uint8Array) => {
  const result = passkeyPublicKey(key);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const signed = (key: Uint8Array, message: Uint8Array) => {
  const result = passkeySign(key, message);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe.each(vectors.keys)("F-12 vector: $name (node:crypto)", (vector) => {
  it("derives the same uncompressed public key", () => {
    expect(hex(publicOf(fromHex(vector.key)))).toBe(vector.publicKey);
  });
});

describe.each(vectors.signatures.cases)("F-12 signature of RFC 6979 A.2.5", (vector) => {
  it(`signs ${vector.message} deterministically, DER and low S, as the RFC does`, () => {
    const key = fromHex(vectors.signatures.key);
    expect(hex(signed(key, fromHex(vector.message)))).toBe(vector.signature);
  });
});

describe.each(vectors.invalid)("F-12 refuses: $name", (vector) => {
  it(`with ${vector.error}`, () => {
    expect(passkeyPublicKey(fromHex(vector.key))).toEqual({ ok: false, error: vector.error });
    expect(passkeySign(fromHex(vector.key), new Uint8Array(1))).toEqual({
      ok: false,
      error: vector.error,
    });
  });
});

describe("newPasskeyKey", () => {
  it("is version 1 and a valid P-256 scalar of 32 bytes, new every time", () => {
    expect([PASSKEY_KEY_V1, PASSKEY_SCALAR_LENGTH, PASSKEY_KEY_LENGTH, ES256]).toEqual([
      1, 32, 33, -7,
    ]);
    const a = newPasskeyKey();
    const b = newPasskeyKey();
    expect(a.length).toBe(33);
    expect(a[0]).toBe(1);
    expect(p256.utils.isValidSecretKey(a.slice(1))).toBe(true);
    expect(hex(a)).not.toBe(hex(b));
    expect(publicOf(a).length).toBe(65);
    expect(publicOf(a)[0]).toBe(4);
  });
});

describe("passkeySign", () => {
  it("makes signatures node:crypto verifies over SHA-256 of the message (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 300 }), (message) => {
        const key = newPasskeyKey();
        const signature = signed(key, message);
        expect(verify("sha256", message, spki(publicOf(key)), signature)).toBe(true);
        // DER, and in the low half: s ≤ n/2
        const parsed = p256.Signature.fromBytes(signature, "der");
        expect(parsed.hasHighS()).toBe(false);
        expect(verify("sha256", Uint8Array.of(...message, 0), spki(publicOf(key)), signature)).toBe(
          false,
        );
      }),
      { numRuns: 25 },
    );
  });

  it("leaves the caller's key as it was and wipes only its own copy", () => {
    const key = fromHex(vectors.signatures.key);
    const before = hex(key);
    signed(key, new Uint8Array(3));
    publicOf(key);
    expect(hex(key)).toBe(before);
  });

  it("refuses a key of another version before it looks at the length", () => {
    expect(passkeySign(new Uint8Array(0), new Uint8Array(1))).toEqual({
      ok: false,
      error: "unknown-version",
    });
    expect(passkeyPublicKey(Uint8Array.of(1))).toEqual({ ok: false, error: "invalid-key" });
  });
});
