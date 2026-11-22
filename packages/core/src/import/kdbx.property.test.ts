/**
 * Fuzzing the KDBX 4 reader (K-502 Teil 3): random bytes, headers and blocks with fields
 * overwritten at random, payloads cut or broken, must never throw or hang; the header parser and
 * the block reader answer with a value or an error, and so does the whole reader.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openKdbx } from "./kdbx.ts";
import { readKdbxHeader } from "./kdbx-header.ts";
import { readHmacBlocks, readInnerHeader } from "./kdbx-payload.ts";
import { fixture } from "./test/helpers.ts";
import { buildKdbx, concat, field, SIGNATURES, u32, variant, variantMap } from "./test/kdbx.ts";

const answers = (result: { ok: boolean; error?: unknown }) =>
  result.ok || typeof result.error === "string";
const KEY = new Uint8Array(64);
const START = concat(SIGNATURES, u32(0x00040001));

/** Bytes with some set, cut or put in at random */
const broken = (source: Uint8Array) =>
  fc
    .array(
      fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 }), fc.constantFrom("set", "cut", "add")),
      { minLength: 1, maxLength: 8 },
    )
    .map((edits) => {
      let bytes = [...source];
      for (const [at, value, edit] of edits) {
        const index = at % (bytes.length + 1);
        if (edit === "set") bytes[index] = value;
        else if (edit === "cut")
          bytes = [...bytes.slice(0, index), ...bytes.slice(index + 1 + (value % 16))];
        else bytes.splice(index, 0, value);
      }
      return new Uint8Array(bytes);
    });

/** Header fields of random IDs and lengths, the lengths lying now and then */
const randomField = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.uint8Array({ maxLength: 40 }), fc.option(fc.nat()))
  .map(([id, value, lie]) => {
    const built = field(id, value);
    if (lie !== null) new DataView(built.buffer).setUint32(1, lie, true);
    return built;
  });

const randomVariant = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.string({ maxLength: 6 }),
    fc.uint8Array({ maxLength: 12 }),
  )
  .map(([type, name, value]) => variant(type, name, value));

describe("KDBX 4 reader under fuzzing", () => {
  it("answers random bytes, with and without the signatures", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), fc.boolean(), (bytes, signed) => {
        const file = signed ? concat(START, bytes) : bytes;
        return (
          answers(readKdbxHeader(file)) &&
          answers(readHmacBlocks(file, 0, KEY)) &&
          answers(readInnerHeader(file))
        );
      }),
      { numRuns: 1000 },
    );
  });

  it("answers headers of random fields and random KDF parameters", () => {
    fc.assert(
      fc.property(
        fc.array(randomField, { maxLength: 8 }),
        fc.array(randomVariant, { maxLength: 6 }),
        (fields, variants) =>
          answers(readKdbxHeader(concat(START, field(11, variantMap(...variants)), ...fields))),
      ),
      { numRuns: 1000 },
    );
  });

  it("answers block streams with lying sizes and inner headers with lying lengths", () => {
    const blocks = buildKdbx({ compress: false });
    const payload = blocks.bytes.subarray(blocks.headerEnd + 64);
    fc.assert(
      fc.property(
        broken(payload),
        (bytes) => answers(readHmacBlocks(bytes, 0, KEY)) && answers(readInnerHeader(bytes)),
      ),
      { numRuns: 1000 },
    );
  });

  it("answers broken databases with an error, never an exception", async () => {
    const sources = [
      fixture("kdbx-aeskdf-aes.kdbx"),
      buildKdbx().bytes,
      buildKdbx({ cipher: "chacha20", compress: false, blockSize: 64 }).bytes,
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(0, 1, 2).chain((i) => broken(sources[i] as Uint8Array)),
        fc.constantFrom("Weber", "Weber-Haustechnik-2026"),
        async (bytes, password) => {
          const result = await openKdbx(bytes, { password });
          // Only an untouched payload can open, and the edits always touch something
          return answers(result);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("answers files cut at any length", async () => {
    const bytes = buildKdbx().bytes;
    for (let length = 0; length < bytes.length; length++) {
      const result = await openKdbx(bytes.subarray(0, length), { password: "Weber" });
      expect(result.ok).toBe(false);
    }
  });
});
