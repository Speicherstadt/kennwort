import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { recoveryLoginSeed } from "./account.ts";
import { ed25519KeyPair } from "./sign.ts";
import { hex } from "./test-helpers.ts";

// The recovery sign-in seed (docs/sicherheitsdesign.md, P-02, P-12)
const recovery = new Uint8Array(32).fill(0x33);
const account = new Uint8Array(16).fill(1);
const key32 = fc.uint8Array({ minLength: 32, maxLength: 32 });
const id16 = fc.uint8Array({ minLength: 16, maxLength: 16 });

describe("recoveryLoginSeed", () => {
  it("matches the fixed vector (HKDF-SHA-512 from node:crypto, enc of label and account)", () => {
    expect(hex(recoveryLoginSeed(recovery, account))).toBe(
      "bdb0a00c5bba719941115d67ba509c24798f4d6f7fd0c18f0b64a28d52fad004",
    );
  });

  it("takes only a 32-byte Recovery Key", () => {
    expect(() => recoveryLoginSeed(new Uint8Array(31), account)).toThrow(
      new RangeError("recovery key must be 32 bytes"),
    );
    expect(() => recoveryLoginSeed(new Uint8Array(33), account)).toThrow(RangeError);
  });

  it("gives 32 bytes, another seed for another key or account, and a usable Ed25519 key", () => {
    fc.assert(
      fc.property(key32, key32, id16, id16, (a, b, idA, idB) => {
        const seed = recoveryLoginSeed(a, idA);
        expect(seed).toHaveLength(32);
        expect(hex(recoveryLoginSeed(a, idA))).toBe(hex(seed));
        if (hex(a) !== hex(b)) expect(hex(recoveryLoginSeed(b, idA))).not.toBe(hex(seed));
        if (hex(idA) !== hex(idB)) expect(hex(recoveryLoginSeed(a, idB))).not.toBe(hex(seed));
        expect(ed25519KeyPair(seed).publicKey).toHaveLength(32);
      }),
      { numRuns: 50 },
    );
  });

  it("is not the Recovery Key itself", () => {
    expect(hex(recoveryLoginSeed(recovery, account))).not.toBe(hex(recovery));
  });
});
