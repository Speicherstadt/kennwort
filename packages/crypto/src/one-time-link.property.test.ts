import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { linkNeedsPassphrase, openLinkWith, sealLinkWith } from "./one-time-link.ts";

// Cheap Argon2id parameters: the properties are about the format, not the cost
const cheap = { m: 8, t: 1, p: 1 };
const secret = fc.uint8Array({ minLength: 32, maxLength: 32 });
const salt = fc.uint8Array({ minLength: 16, maxLength: 16 });
const nonce = fc.uint8Array({ minLength: 24, maxLength: 24 });
const plaintext = fc.uint8Array({ maxLength: 200 });
const passphrase = fc.option(fc.string({ minLength: 1, maxLength: 24, unit: "grapheme" }), {
  nil: undefined,
});

const seal = (s: Uint8Array, n: Uint8Array, text: Uint8Array, p?: string, salted?: Uint8Array) =>
  sealLinkWith(cheap, {
    secret: s,
    nonce: n,
    plaintext: text,
    passphrase: p === undefined || !salted ? undefined : { text: p, salt: salted },
  });

describe("F-15 properties", () => {
  it("opens what it sealed, with or without a passphrase", async () => {
    await fc.assert(
      fc.asyncProperty(secret, salt, nonce, plaintext, passphrase, async (s, a, n, text, p) => {
        const link = await seal(s, n, text, p, a);
        expect(linkNeedsPassphrase(link)).toBe(p !== undefined);
        expect(await openLinkWith(cheap, s, link, p)).toEqual({ ok: true, value: text });
      }),
      { numRuns: 40 },
    );
  });

  it("never opens with another secret", async () => {
    await fc.assert(
      fc.asyncProperty(secret, secret, nonce, plaintext, async (a, b, n, text) => {
        fc.pre(Buffer.compare(a, b) !== 0);
        const link = await seal(a, n, text);
        expect((await openLinkWith(cheap, b, link)).ok).toBe(false);
      }),
      { numRuns: 60 },
    );
  });

  it("never opens a protected link with another passphrase (after NFKC)", async () => {
    const some = fc.string({ minLength: 1, maxLength: 24, unit: "grapheme" });
    await fc.assert(
      fc.asyncProperty(secret, salt, nonce, plaintext, some, some, async (s, a, n, text, p, q) => {
        fc.pre(p.normalize("NFKC") !== q.normalize("NFKC"));
        const link = await seal(s, n, text, p, a);
        expect((await openLinkWith(cheap, s, link, q)).ok).toBe(false);
      }),
      { numRuns: 40 },
    );
  });

  it("answers any bytes with an error value, never an exception", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 120 }), secret, async (bytes, s) => {
        expect((await openLinkWith(cheap, s, bytes, "Kessel")).ok).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
