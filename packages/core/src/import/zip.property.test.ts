/**
 * Fuzzing the ZIP reader and the parsers of the ZIP containers (K-502 Teil 2): random bytes,
 * archives cut short, broken at random or with lying headers, and zip bombs must never throw or
 * hang; each answers with files or entries, or an error value.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDashlaneZip } from "./dashlane-zip.ts";
import { parseOnePassword1pux, parseOnePasswordData } from "./onepassword-1pux.ts";
import { parseProtonPassZip } from "./protonpass-zip.ts";
import { fixture } from "./test/helpers.ts";
import { buildZip, patched, type ZipSpec } from "./test/zip.ts";
import type { ZipParser } from "./types.ts";
import { readZip, ZIP_LIMITS } from "./zip.ts";

const PARSERS: [string, ZipParser][] = [
  ["1password-1pux", parseOnePassword1pux],
  ["dashlane-zip", parseDashlaneZip],
  ["protonpass-zip", parseProtonPassZip],
];
const FIXTURES = ["onepassword.1pux", "dashlane.zip", "protonpass.zip"];

/** An answer is a list or one of the errors, never anything else */
const answers = async (parse: ZipParser, bytes: Uint8Array) => {
  const result = await parse(bytes);
  return result.ok ? Array.isArray(result.value) : typeof result.error === "string";
};
const readsAll = (bytes: Uint8Array) => readZip(bytes, () => true);
const reads = async (bytes: Uint8Array) => {
  const result = await readsAll(bytes);
  return result.ok ? Array.isArray(result.value) : typeof result.error === "string";
};

/** A fixture with bytes flipped, cut or put in at random */
const brokenFixture = fc
  .tuple(
    fc.constantFrom(...FIXTURES),
    fc.array(
      fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 }), fc.constantFrom("set", "cut", "add")),
      { minLength: 1, maxLength: 8 },
    ),
  )
  .map(([name, edits]) => {
    let bytes = [...fixture(name)];
    for (const [at, value, edit] of edits) {
      const index = at % (bytes.length + 1);
      if (edit === "set") bytes[index] = value;
      else if (edit === "cut")
        bytes = [...bytes.slice(0, index), ...bytes.slice(index + 1 + (value % 64))];
      else bytes.splice(index, 0, value);
    }
    return new Uint8Array(bytes);
  });

/** A fixture cut at either end */
const truncatedFixture = fc
  .tuple(fc.constantFrom(...FIXTURES), fc.nat(), fc.boolean())
  .map(([name, at, fromStart]) => {
    const bytes = fixture(name);
    const cut = at % bytes.length;
    return fromStart ? bytes.subarray(cut) : bytes.subarray(0, cut);
  });

/** Every number field of the headers, as offsets into one header and their width */
const LOCAL_FIELDS: [number, 2 | 4][] = [
  [0, 4],
  [6, 2],
  [8, 2],
  [14, 4],
  [18, 4],
  [22, 4],
  [26, 2],
  [28, 2],
];
const CENTRAL_FIELDS: [number, 2 | 4][] = [
  [0, 4],
  [8, 2],
  [10, 2],
  [16, 4],
  [20, 4],
  [24, 4],
  [28, 2],
  [30, 2],
  [32, 2],
  [42, 4],
];
const END_FIELDS: [number, 2 | 4][] = [
  [4, 2],
  [6, 2],
  [8, 2],
  [10, 2],
  [12, 4],
  [16, 4],
  [20, 2],
];

const fieldValue = fc.oneof(
  fc.constantFrom(0, 1, 0xffff, 0xffffffff, 0x7fffffff),
  fc.integer({ min: 0, max: 0xffffffff }),
);

/** A well-formed archive with header fields overwritten at random: lying lengths and offsets */
const lyingArchive = fc
  .tuple(
    fc.array(
      fc.record({
        name: fc.constantFrom("export.data", "credentials.csv", "Proton Pass/data.json", "x/"),
        data: fc.string({ maxLength: 300 }),
        method: fc.constantFrom("stored" as const, "deflate" as const),
      }),
      { minLength: 1, maxLength: 4 },
    ),
    fc.array(fc.tuple(fc.constantFrom("local", "central", "end"), fc.nat(), fc.nat(), fieldValue), {
      minLength: 1,
      maxLength: 4,
    }),
  )
  .map(([specs, edits]) => {
    const unique = specs.map((spec, i) => ({ ...spec, name: `${i}${spec.name}` }));
    const built = buildZip(unique);
    let bytes = built.bytes;
    for (const [part, which, field, value] of edits) {
      const [starts, fields] =
        part === "local"
          ? [built.local, LOCAL_FIELDS]
          : part === "central"
            ? [built.central, CENTRAL_FIELDS]
            : [[built.end], END_FIELDS];
      const start = starts[which % starts.length] ?? 0;
      const [offset, size] = fields[field % fields.length] ?? [0, 2];
      bytes = patched(bytes, start + offset, size === 2 ? value & 0xffff : value, size);
    }
    return bytes;
  });

describe("ZIP reader under fuzzing (K-502)", () => {
  it("answers random bytes, with and without an end record", async () => {
    const end = buildZip([]).bytes;
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), fc.boolean(), (bytes, withEnd) =>
        reads(withEnd ? new Uint8Array([...bytes, ...end]) : bytes),
      ),
      { numRuns: 300 },
    );
  });

  it("answers broken and truncated fixtures", async () => {
    await fc.assert(fc.asyncProperty(fc.oneof(brokenFixture, truncatedFixture), reads), {
      numRuns: 300,
    });
  });

  it("answers archives whose headers lie", async () => {
    await fc.assert(fc.asyncProperty(lyingArchive, reads), { numRuns: 400 });
  });

  it("reads back every archive a writer made, stored or deflated", async () => {
    const name = fc
      .array(fc.constantFrom("a", "B", "ä", ".", "-", "_", " ", "1"), {
        minLength: 1,
        maxLength: 8,
      })
      .map((parts) => parts.join(""))
      .filter((n) => n !== "..");
    const spec = fc.record({
      name,
      data: fc.uint8Array({ maxLength: 2000 }),
      method: fc.constantFrom("stored" as const, "deflate" as const),
    });
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(spec, { selector: (s) => s.name, maxLength: 5 }),
        async (specs: ZipSpec[]) => {
          const result = await readsAll(buildZip(specs).bytes);
          expect(result).toEqual({
            ok: true,
            value: specs.map((s) => ({ name: s.name, bytes: s.data })),
          });
        },
      ),
      { numRuns: 150 },
    );
  });

  it("ends a zip bomb before it fills the memory", async () => {
    // 200 MB of zeros pack into about 200 KB, a ratio of about 1:1000
    const bomb = buildZip([{ name: "export.data", data: new Uint8Array(200_000_000) }]);
    const started = performance.now();
    expect(await readsAll(bomb.bytes)).toEqual({ ok: false, error: "too-large" });
    // With the ratio allowed, the size limit ends it
    const big = await readZip(bomb.bytes, () => true, { ...ZIP_LIMITS, ratio: 2000 });
    expect(big).toEqual({ ok: false, error: "too-large" });
    // And when the directory understates the size, inflating stops at what it declared
    const at = bomb.central[0] ?? 0;
    const lying = patched(patched(bomb.bytes, at + 24, 1_000_000, 4), at + 20, 1_000_000, 4);
    expect(await readsAll(lying)).toEqual({ ok: false, error: "bad-zip" });
    expect(performance.now() - started).toBeLessThan(5_000);
  }, 30_000);

  it("ends at the number of entries before it reads them", async () => {
    const many = buildZip(
      Array.from({ length: ZIP_LIMITS.entries + 1 }, (_, i) => ({
        name: `${i}.csv`,
        data: "",
        method: "stored" as const,
      })),
    );
    expect(await readsAll(many.bytes)).toEqual({ ok: false, error: "too-large" });
  });
});

describe("ZIP container parsers under fuzzing (K-502)", () => {
  it.each(PARSERS)("%s answers random bytes", async (_, parse) => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), (bytes) => answers(parse, bytes)),
      { numRuns: 100 },
    );
  });

  it.each(PARSERS)("%s answers broken and truncated fixtures", async (_, parse) => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(brokenFixture, truncatedFixture), (bytes) => answers(parse, bytes)),
      { numRuns: 150 },
    );
  });

  it.each(PARSERS)("%s answers archives whose headers lie", async (_, parse) => {
    await fc.assert(
      fc.asyncProperty(lyingArchive, (bytes) => answers(parse, bytes)),
      { numRuns: 150 },
    );
  });

  it.each(PARSERS)("%s answers its file with random content", async (_, parse) => {
    const names = ["export.data", "credentials.csv", "Proton Pass/data.json"];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...names),
        fc.oneof(fc.string(), fc.uint8Array({ maxLength: 300 })),
        (name, data) => answers(parse, buildZip([{ name, data }]).bytes),
      ),
      { numRuns: 100 },
    );
  });
});

describe("1PUX data under fuzzing (K-502)", () => {
  it("answers any JSON in the structure of export.data", () => {
    const any = fc.jsonValue({ maxDepth: 2 });
    const value = fc.oneof(
      any,
      fc.dictionary(
        fc.constantFrom(
          "string",
          "concealed",
          "totp",
          "date",
          "monthYear",
          "address",
          "sshKey",
          "email",
        ),
        any,
        { maxKeys: 2 },
      ),
    );
    const field = fc.record({ title: any, id: any, value }, { requiredKeys: [] });
    const item = fc.record(
      {
        favIndex: any,
        categoryUuid: fc.oneof(
          fc.constantFrom("001", "002", "004", "005", "109", "112", "114"),
          any,
        ),
        details: fc.oneof(
          any,
          fc.record(
            {
              loginFields: fc.oneof(
                any,
                fc.array(fc.record({ value: any, fieldType: any, designation: any }), {
                  maxLength: 3,
                }),
              ),
              notesPlain: any,
              password: any,
              sections: fc.oneof(
                any,
                fc.array(fc.record({ title: any, fields: fc.array(field, { maxLength: 3 }) }), {
                  maxLength: 3,
                }),
              ),
              passwordHistory: fc.oneof(
                any,
                fc.array(fc.record({ value: any, time: any }), { maxLength: 3 }),
              ),
            },
            { requiredKeys: [] },
          ),
        ),
        overview: fc.oneof(
          any,
          fc.record({ title: any, url: any, urls: any, tags: any }, { requiredKeys: [] }),
        ),
      },
      { requiredKeys: [] },
    );
    const data = fc.record({
      accounts: fc.array(
        fc.record({
          vaults: fc.array(
            fc.record({ attrs: fc.record({ name: any }), items: fc.array(item, { maxLength: 3 }) }),
            {
              maxLength: 3,
            },
          ),
        }),
        { maxLength: 3 },
      ),
    });
    fc.assert(
      fc.property(data, (json) => {
        const result = parseOnePasswordData(JSON.stringify(json));
        return result.ok ? Array.isArray(result.value) : typeof result.error === "string";
      }),
      { numRuns: 300 },
    );
  });
});
