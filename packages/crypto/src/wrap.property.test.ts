import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Part } from "./encoding.ts";
import { unwrap, wrap, xwingKeyPair } from "./wrap.ts";

// X-Wing key generation is slow in pure TypeScript; a few fixed pairs keep the runs short
const pairs = [1, 2, 3].map((n) => xwingKeyPair(new Uint8Array(32).fill(n)));
const pair = fc.constantFrom(...pairs);
const bytes32 = fc.uint8Array({ minLength: 32, maxLength: 32 });
const part: fc.Arbitrary<Part> = fc.oneof(
  fc.uint8Array({ maxLength: 16 }),
  fc.string({ maxLength: 8 }),
  fc.nat(),
);
const where = fc.record({
  purpose: fc.string({ maxLength: 8 }),
  context: fc.array(part, { maxLength: 3 }),
});
const runs = { numRuns: 25 };

describe("F-02 properties", () => {
  it("gives every payload back to the recipient", () => {
    fc.assert(
      fc.property(pair, bytes32, fc.uint8Array({ maxLength: 64 }), where, (p, fp, payload, w) => {
        const pkg = wrap({ publicKey: p.publicKey, fingerprint: fp }, payload, w);
        expect(unwrap(p.secretKey, fp, pkg, w)).toEqual({ ok: true, value: payload });
      }),
      runs,
    );
  });

  it("never unwraps after any single bit of the package flips", () => {
    const [p] = pairs;
    if (!p) throw new Error("no key pair");
    const fp = new Uint8Array(32);
    const pkg = wrap({ publicKey: p.publicKey, fingerprint: fp }, new Uint8Array(32).fill(7), {
      purpose: "x",
      context: [],
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: pkg.length - 1 }),
        fc.integer({ min: 0, max: 7 }),
        (at, bit) => {
          const changed = pkg.slice();
          changed[at] = (changed[at] ?? 0) ^ (1 << bit);
          expect(unwrap(p.secretKey, fp, changed, { purpose: "x", context: [] }).ok).toBe(false);
        },
      ),
      runs,
    );
  });

  it("never unwraps with another fingerprint", () => {
    fc.assert(
      fc.property(pair, bytes32, bytes32, where, (p, fp1, fp2, w) => {
        fc.pre(Buffer.compare(fp1, fp2) !== 0);
        const pkg = wrap({ publicKey: p.publicKey, fingerprint: fp1 }, new Uint8Array(32), w);
        expect(unwrap(p.secretKey, fp2, pkg, w).ok).toBe(false);
      }),
      runs,
    );
  });
});
