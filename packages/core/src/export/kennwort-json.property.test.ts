/**
 * Fuzzing the reader of Kennwort's own export (K-504, F-13): random text, random bytes, random
 * JSON and files broken at random never throw or hang; the reader answers with an error value.
 */
import { sealExportWith } from "@kennwort/crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { checkKennwortExport, unlockKennwortExportWith } from "./kennwort-json.ts";
import { WEBER } from "./test/weber.ts";

const cheap = { m: 8, t: 1, p: 1 };
const utf8 = (text: string) => new TextEncoder().encode(text);
const envelope = (data: unknown, version: unknown = 1) =>
  utf8(JSON.stringify({ kennwort: "export", version, data }));

const read = async (file: Uint8Array) => {
  const checked = await checkKennwortExport(file);
  const opened = await unlockKennwortExportWith(cheap, file, "Kessel");
  return [checked, opened];
};

describe("Kennwort export reader under fuzzing", () => {
  it("answers random bytes and random text with an error value", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.uint8Array({ maxLength: 300 }), fc.string().map(utf8)),
        async (file) => {
          for (const result of await read(file)) expect(result.ok).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("answers random JSON and random envelopes with an error value", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.json().map(utf8),
          fc
            .tuple(fc.jsonValue(), fc.jsonValue())
            .map(([data, version]) => envelope(data, version)),
          fc.uint8Array({ maxLength: 120 }).map((bytes) => envelope(encodeBytes(bytes))),
        ),
        async (file) => {
          for (const result of await read(file)) expect(result.ok).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("refuses a real export with any byte of its F-13 data changed", async () => {
    const plain = utf8(JSON.stringify({ version: 1, exportedAt: 0, vaults: WEBER }));
    const data = await sealExportWith(
      cheap,
      "Kessel",
      new Uint8Array(16),
      new Uint8Array(24),
      plain,
    );
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: data.length - 1 }),
        fc.integer({ min: 1, max: 255 }),
        async (at, flip) => {
          const changed = data.slice();
          changed[at] = (changed[at] as number) ^ flip;
          const opened = await unlockKennwortExportWith(
            cheap,
            envelope(encodeBytes(changed)),
            "Kessel",
          );
          expect(opened.ok).toBe(false);
        },
      ),
      { numRuns: 150 },
    );
    expect((await unlockKennwortExportWith(cheap, envelope(encodeBytes(data)), "Kessel")).ok).toBe(
      true,
    );
  });

  it("answers an authentic payload of any shape with entries or an error value", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.json(), fc.string()), async (plain) => {
        const data = await sealExportWith(
          cheap,
          "Kessel",
          new Uint8Array(16),
          new Uint8Array(24),
          utf8(plain),
        );
        const opened = await unlockKennwortExportWith(cheap, envelope(encodeBytes(data)), "Kessel");
        expect(typeof opened.ok).toBe("boolean");
      }),
      { numRuns: 150 },
    );
  });
});
