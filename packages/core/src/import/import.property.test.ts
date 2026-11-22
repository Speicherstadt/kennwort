/**
 * Fuzzing the import parsers (K-502, docs/plan.md Tests): random text, random bytes and fixtures
 * broken at random must never throw or hang; each parser answers with entries or an error value.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.ts";
import { IMPORT_FORMATS, type ImportFormat } from "./formats.ts";
import { parseKeePassXml } from "./keepass-xml.ts";
import { parseTableCsv } from "./table.ts";
import { fixture } from "./test/helpers.ts";
import type { Parser } from "./types.ts";
import { parseXml } from "./xml.ts";

/**
 * The text formats; the ZIP containers and KeePass's KDBX have their own fuzzing
 * (zip.property.test.ts, kdbx.property.test.ts)
 */
const isText = (format: ImportFormat): format is ImportFormat & { parse: Parser } =>
  format.file !== "ZIP" && format.file !== "1PUX" && format.file !== "KDBX";

const PARSERS: [string, Parser][] = [
  ...IMPORT_FORMATS.filter(isText).map((f): [string, Parser] => [f.id, f.parse]),
  ["table-csv", parseTableCsv({ title: "a", password: "b", url: "c", tags: "d" })],
];
const FIXTURES = [
  "bitwarden.json",
  "bitwarden-protected-argon2id.json",
  "bitwarden-account-encrypted-v2.json",
  "bitwarden.csv",
  "lastpass.csv",
  "onepassword.csv",
  "keepass.xml",
  "keepassxc.csv",
  "nordpass.csv",
  "protonpass.json",
  "enpass.json",
  "keeper.csv",
  "teampasswordmanager.csv",
  "cxf.json",
  "dashlane-payments.csv",
  "chrome.csv",
  "google-authenticator.txt",
  "aegis.json",
  "aegis-encrypted.json",
  "twofas.2fas",
  "twofas-encrypted.2fas",
];

/** An answer is entries or one of the parsers' errors, never anything else */
const answers = (parse: Parser, input: string | Uint8Array) => {
  const result = parse(input);
  return result.ok ? Array.isArray(result.value) : typeof result.error === "string";
};

/** Text made of what the formats are made of, so the fuzzer gets past the first check */
const markupText = fc
  .array(
    fc.constantFrom(
      ",",
      '"',
      "\n",
      "\r",
      "<",
      ">",
      "/",
      "=",
      "'",
      "&",
      ";",
      "{",
      "}",
      "[",
      "]",
      ":",
      "\\",
      "<![CDATA[",
      "]]>",
      "<!--",
      "-->",
      "&#x1F525;",
      "&amp;",
      "<Group>",
      "</Group>",
      "<Entry>",
      "<KeePassFile><Root><Group>",
      '{"items":[',
      '{"vaults":{"v":{"items":[',
      '"type":1',
      "url,username,password,extra,name,grouping",
      "http://sn",
      "NoteType:Credit Card",
      "otpauth-migration://offline?data=",
      "CiAKCkhlbGxvId6tvu8SBWpvbmFz",
      '{"version":1,"header":{},"db":{"entries":[',
      '{"type":"totp","info":{"secret":"JBSWY3DPEHPK3PXP"',
      '{"schemaVersion":4,"services":[',
      '{"secret":"JBSWY3DPEHPK3PXP","otp":{',
      '{"version":{"major":1},"accounts":[{"id":"a","items":[{"id":"i","credentials":[',
      '{"type":"passkey","rpId":"a","credentialId":"YQ","userHandle":"YQ","key":"',
      '"collections":[{"title":"t","items":[{"item":"i"}],"subCollections":[',
      '"Project name","Name","Access","User","E-mail","Password","Notes","Tags","Custom fields",',
      '"1","2","3","4","5","6","7","8","9","10","Expiry date (mm-dd-yyyy)"\n',
      "a",
      "ä",
      "0",
    ),
    { maxLength: 60 },
  )
  .map((parts) => parts.join(""));

/** A fixture with bytes flipped, cut or put in at random */
const brokenFixture = fc
  .tuple(
    fc.constantFrom(...FIXTURES),
    fc.array(
      fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 }), fc.constantFrom("set", "cut", "add")),
      {
        minLength: 1,
        maxLength: 8,
      },
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

describe("import parsers under fuzzing (K-502, K-503)", () => {
  it.each(PARSERS)("%s answers random text without throwing", (_, parse) => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ unit: "grapheme-composite" }), markupText), (text) =>
        answers(parse, text),
      ),
      {
        numRuns: 150,
      },
    );
  });

  it.each(PARSERS)("%s answers random bytes without throwing", (_, parse) => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => answers(parse, bytes)),
      {
        numRuns: 100,
      },
    );
  });

  it.each(PARSERS)("%s answers broken fixtures without throwing", (_, parse) => {
    fc.assert(
      fc.property(brokenFixture, (bytes) => answers(parse, bytes)),
      { numRuns: 60 },
    );
  });

  it("answers deep nesting and long runs quickly, without recursion", () => {
    const deep = 50_000;
    const inputs = [
      `${"<a>".repeat(deep)}${"</a>".repeat(deep)}`,
      `<KeePassFile><Root>${"<Group>".repeat(deep)}${"</Group>".repeat(deep)}</Root></KeePassFile>`,
      `${"[".repeat(deep)}${"]".repeat(deep)}`,
      `"${'""'.repeat(deep)}`,
      `<a ${"x='1' ".repeat(deep)}`,
      `<a>${"&amp".repeat(deep)}</a>`,
      `url,username,password,extra,name,grouping\nhttp://sn,,,"NoteType:X\n${"a:b\n".repeat(deep)}",n,`,
    ];
    for (const input of inputs)
      for (const [, parse] of PARSERS) expect(answers(parse, input)).toBe(true);
  }, 60_000);

  it("reads deeply nested KeePass groups in linear time", () => {
    // Half a million levels take about a second; a quadratic walk would take hours
    const deep = 500_000;
    const groups = `${"<Group><Name>g</Name>".repeat(deep)}${"</Group>".repeat(deep)}`;
    const xml = `<KeePassFile><Root>${groups}</Root></KeePassFile>`;
    expect(parseKeePassXml(xml)).toEqual({ ok: true, value: [] });
  }, 60_000);
});

/** RFC 4180 as a writer would quote it */
const quoteCell = (cell: string) =>
  /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;

describe("CSV reader properties (K-502)", () => {
  it("reads back what a writer quoted, whatever the cells hold", () => {
    const cell = fc.string({ unit: fc.constantFrom("a", "ä", ",", '"', "\n", "\r\n", " ", "x") });
    const row = fc.array(cell, { minLength: 2, maxLength: 6 });
    fc.assert(
      fc.property(
        fc.array(row, { minLength: 1, maxLength: 6 }),
        fc.constantFrom("\n", "\r\n"),
        (rows, eol) => {
          const text = rows.map((r) => r.map(quoteCell).join(",")).join(eol);
          expect(parseCsv(text)).toEqual({ ok: true, value: rows });
        },
      ),
    );
  });

  it("never loses a well-formed element", () => {
    const name = fc.constantFrom("a", "b", "Group", "Entry");
    const body = fc.string({ unit: fc.constantFrom("x", "&amp;", "&lt;", " ", "ä") });
    fc.assert(
      fc.property(name, fc.array(fc.tuple(name, body), { maxLength: 8 }), (root, kids) => {
        const xml = `<${root}>${kids.map(([n, t]) => `<${n}>${t}</${n}>`).join("")}</${root}>`;
        const result = parseXml(xml);
        expect(result.ok && result.value.children.map((c) => c.name)).toEqual(kids.map(([n]) => n));
      }),
    );
  });
});
