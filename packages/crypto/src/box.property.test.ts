import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxAad, KEY_LENGTH, NONCE_LENGTH, open, seal } from "./box.ts";
import type { Part } from "./encoding.ts";

const key = fc.uint8Array({ minLength: KEY_LENGTH, maxLength: KEY_LENGTH });
const plaintext = fc.uint8Array({ maxLength: 256 });
const part: fc.Arbitrary<Part> = fc.oneof(
  fc.uint8Array({ maxLength: 16 }),
  fc.string({ maxLength: 12 }),
  fc.nat(),
);
const where = fc.record({
  purpose: fc.string({ maxLength: 12 }),
  context: fc.array(part, { maxLength: 4 }),
});
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
// Two places differ when their associated data differ; equal encodings are the same place
const aadOf = (w: { purpose: string; context: Part[] }) => hex(boxAad(w));

describe("F-01 properties", () => {
  it("opens what it sealed, for every key, plaintext, purpose and context", () => {
    fc.assert(
      fc.property(key, plaintext, where, (k, p, w) => {
        expect(open(k, seal(k, p, w), w)).toEqual({ ok: true, value: p });
      }),
    );
  });

  it("never opens with another key", () => {
    fc.assert(
      fc.property(key, key, plaintext, where, (k1, k2, p, w) => {
        fc.pre(hex(k1) !== hex(k2));
        expect(open(k2, seal(k1, p, w), w).ok).toBe(false);
      }),
    );
  });

  it("never opens in another place (purpose or context)", () => {
    fc.assert(
      fc.property(key, plaintext, where, where, (k, p, w1, w2) => {
        fc.pre(aadOf(w1) !== aadOf(w2));
        expect(open(k, seal(k, p, w1), w2).ok).toBe(false);
      }),
    );
  });

  it("never opens after any single bit of the nonce, ciphertext or tag flips", () => {
    fc.assert(
      fc.property(
        key,
        plaintext,
        where,
        fc.nat(),
        fc.integer({ min: 0, max: 7 }),
        (k, p, w, at, bit) => {
          const box = seal(k, p, w);
          const index = 1 + (at % (box.length - 1));
          const changed = box.slice();
          changed[index] = (changed[index] ?? 0) ^ (1 << bit);
          expect(open(k, changed, w).ok).toBe(false);
        },
      ),
    );
  });

  it("never opens a box whose nonce was swapped for another", () => {
    fc.assert(
      fc.property(
        key,
        plaintext,
        where,
        fc.uint8Array({ minLength: NONCE_LENGTH, maxLength: NONCE_LENGTH }),
        (k, p, w, nonce) => {
          const box = seal(k, p, w);
          fc.pre(hex(nonce) !== hex(box.subarray(1, 1 + NONCE_LENGTH)));
          const swapped = box.slice();
          swapped.set(nonce, 1);
          expect(open(k, swapped, w).ok).toBe(false);
        },
      ),
    );
  });
});
