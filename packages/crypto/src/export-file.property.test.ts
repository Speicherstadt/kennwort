import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openExportWith, sealExportWith } from "./export-file.ts";

// Cheap Argon2id parameters: the properties are about the format, not the cost
const cheap = { m: 8, t: 1, p: 1 };
const passphrase = fc.string({ minLength: 1, maxLength: 24, unit: "grapheme" });
const salt = fc.uint8Array({ minLength: 16, maxLength: 16 });
const nonce = fc.uint8Array({ minLength: 24, maxLength: 24 });
const plaintext = fc.uint8Array({ maxLength: 200 });

describe("F-13 properties", () => {
  it("opens what it sealed, for every passphrase, salt, nonce and plaintext", async () => {
    await fc.assert(
      fc.asyncProperty(passphrase, salt, nonce, plaintext, async (p, s, n, text) => {
        const file = await sealExportWith(cheap, p, s, n, text);
        expect(await openExportWith(cheap, p, file)).toEqual({ ok: true, value: text });
      }),
      { numRuns: 40 },
    );
  });

  it("never opens with another passphrase (after NFKC)", async () => {
    await fc.assert(
      fc.asyncProperty(passphrase, passphrase, salt, nonce, plaintext, async (a, b, s, n, text) => {
        fc.pre(a.normalize("NFKC") !== b.normalize("NFKC"));
        const file = await sealExportWith(cheap, a, s, n, text);
        expect((await openExportWith(cheap, b, file)).ok).toBe(false);
      }),
      { numRuns: 40 },
    );
  });

  it("answers any bytes with an error value, never an exception", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 120 }), async (bytes) => {
        const opened = await openExportWith(cheap, "Kessel", bytes);
        expect(opened.ok).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("refuses every single changed byte", async () => {
    const file = await sealExportWith(
      cheap,
      "Kessel",
      new Uint8Array(16),
      new Uint8Array(24),
      new TextEncoder().encode("Zugang Lager"),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: file.length - 1 }),
        fc.integer({ min: 1, max: 255 }),
        async (at, flip) => {
          const changed = file.slice();
          changed[at] = (changed[at] as number) ^ flip;
          expect((await openExportWith(cheap, "Kessel", changed)).ok).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
