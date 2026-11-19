import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/wrap-v1.json" with { type: "json" };
import draft from "../vectors/xwing-draft.json" with { type: "json" };
import type { Part } from "./encoding.ts";
import { fromHex, hex } from "./test-helpers.ts";
import { unwrap, wrapWithRandomness, xwingKeyPair } from "./wrap.ts";

const contextOf = (parts: (string | number | { hex: string })[]): Part[] =>
  parts.map((part) => (typeof part === "object" ? fromHex(part.hex) : part));

// draft-connolly-cfrg-xwing-kem test vectors, as RustCrypto/KEMs and noble-post-quantum carry them
describe.each(draft.map((vector, index) => ({ index, ...vector })))(
  "X-Wing draft vector $index",
  (vector) => {
    it("derives the key pair from the seed", () => {
      const { publicKey, secretKey } = xwingKeyPair(fromHex(vector.seed));
      expect(hex(publicKey)).toBe(vector.pk);
      expect(hex(secretKey)).toBe(vector.sk);
    });

    it("encapsulates to the draft's ciphertext and shared secret", () => {
      const { cipherText, sharedSecret } = xwing.encapsulate(
        fromHex(vector.pk),
        fromHex(vector.eseed),
      );
      expect(hex(cipherText)).toBe(vector.ct);
      expect(hex(sharedSecret)).toBe(vector.ss);
    });

    it("decapsulates to the draft's shared secret", () => {
      expect(hex(xwing.decapsulate(fromHex(vector.ct), fromHex(vector.sk)))).toBe(vector.ss);
    });
  },
);

describe.each(vectors)(
  "F-02 vector: $name (HKDF from node:crypto, AEAD from libsodium)",
  (vector) => {
    const { publicKey, secretKey } = xwingKeyPair(fromHex(vector.seed));
    const fingerprint = fromHex(vector.fingerprint);
    const where = { purpose: vector.purpose, context: contextOf(vector.context) };

    it("wraps to the same package", () => {
      const pkg = wrapWithRandomness({ publicKey, fingerprint }, fromHex(vector.payload), where, {
        kem: fromHex(vector.kemRandomness),
        nonce: fromHex(vector.nonce),
      });
      expect(hex(pkg)).toBe(vector.package);
    });

    it("unwraps the package", () => {
      expect(hex(secretKey)).toBe(vector.secretKey);
      const opened = unwrap(secretKey, fingerprint, fromHex(vector.package), where);
      expect(opened.ok && hex(opened.value)).toBe(vector.payload);
    });
  },
);
