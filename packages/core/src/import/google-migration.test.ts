import { describe, expect, it } from "vitest";
import { migrationBatch, parseGoogleMigration } from "./google-migration.ts";
import { compact, fixture, fixtureText } from "./test/helpers.ts";
import {
  type Field,
  message,
  migrationLink,
  migrationPayload,
  type Otp,
  otpParameters,
} from "./test/protobuf.ts";

const KEY = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
const jonas: Otp = { secret: KEY, name: "jonas", issuer: "DATEV" };
const link = (otps: Otp[], batch?: { size: number; index: number; id: number }) =>
  migrationLink(migrationPayload(otps, batch));
const codes = (input: string) => {
  const result = parseGoogleMigration(input);
  return result.ok ? result.value.map((entry) => entry.content.fields.at(-1)?.value) : result.error;
};
const DATEV = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV";

describe("Google Authenticator migration QR (K-503)", () => {
  it("reads an export across two QR codes; the HOTP account is counted", () => {
    const [first, second] = fixtureText("google-authenticator.txt").trim().split("\n");
    // In any order, as the codes were scanned
    for (const input of [fixture("google-authenticator.txt"), `${second}\n${first}`]) {
      const result = parseGoogleMigration(input);
      expect(compact(result)).toEqual([
        {
          type: "login",
          title: "DATEV",
          fields: [
            ["username", "Username", "jonas@weber-haustechnik.example", "text"],
            [
              "totp",
              "One-time code",
              "otpauth://totp/DATEV:jonas%40weber-haustechnik.example?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
              "totp",
            ],
          ],
        },
        {
          type: "login",
          title: "Microsoft 365",
          fields: [
            ["username", "Username", "anna@weber-haustechnik.example", "text"],
            [
              "totp",
              "One-time code",
              "otpauth://totp/Microsoft%20365:anna%40weber-haustechnik.example?secret=KRUGKIDROVUWG2ZAMJZG653OEBTG66BA&issuer=Microsoft+365&algorithm=SHA256&digits=8&period=30",
              "totp",
            ],
          ],
        },
        {
          type: "login",
          title: "Sparkasse",
          fields: [
            ["username", "Username", "sandra.becker", "text"],
            [
              "totp",
              "One-time code",
              "otpauth://totp/Sparkasse:sandra.becker?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Sparkasse&algorithm=SHA1&digits=6&period=30",
              "totp",
            ],
          ],
        },
      ]);
      expect(result).toMatchObject({ ok: true, skipped: 1 });
    }
  });

  it("needs every QR code of an export; the same code twice counts once", () => {
    const [first, second] = fixtureText("google-authenticator.txt").trim().split("\n");
    expect(parseGoogleMigration(first ?? "")).toEqual({ ok: false, error: "incomplete" });
    expect(parseGoogleMigration(`${second}\n${second}`)).toEqual({
      ok: false,
      error: "incomplete",
    });
    expect(parseGoogleMigration(`${first} ${second}\r\n${first}`)).toMatchObject({
      ok: true,
      skipped: 1,
    });
    // A code that says it is number 2 of 2 does not fit an export of two (0 and 1)
    expect(
      codes(
        `${link([jonas], { size: 2, index: 0, id: 7 })}\n${link([jonas], { size: 2, index: 2, id: 7 })}`,
      ),
    ).toBe("incomplete");
    // Codes of one export that disagree on its size
    expect(
      codes(
        `${link([jonas], { size: 2, index: 0, id: 7 })}\n${link([jonas], { size: 3, index: 1, id: 7 })}`,
      ),
    ).toBe("incomplete");
  });

  it("reads two whole exports at once, each in the order of its codes", () => {
    const sandra: Otp = { secret: KEY, name: "sandra", issuer: "Sparkasse" };
    const input = [
      link([sandra], { size: 2, index: 1, id: 9 }),
      link([jonas], { size: 1, index: 0, id: 3 }),
      link([{ ...sandra, name: "anna" }], { size: 2, index: 0, id: 9 }),
    ].join("\n");
    expect(parseGoogleMigration(input)).toMatchObject({
      ok: true,
      value: [
        { content: { fields: [{ value: "anna" }, {}] } },
        { content: { fields: [{ value: "sandra" }, {}] } },
        { content: { fields: [{ value: "jonas" }, {}] } },
      ],
    });
  });

  it("reads the settings by their numbers, zero being the default", () => {
    const of = (otp: Partial<Otp>) => codes(link([{ ...jonas, ...otp }]));
    expect(of({})).toEqual([`${DATEV}&algorithm=SHA1&digits=6&period=30`]);
    expect(of({ algorithm: 0, digits: 0, type: 0 })).toEqual([
      `${DATEV}&algorithm=SHA1&digits=6&period=30`,
    ]);
    expect(of({ algorithm: 3, digits: 2 })).toEqual([
      `${DATEV}&algorithm=SHA512&digits=8&period=30`,
    ]);
    for (const otp of [
      { algorithm: 4 },
      { algorithm: 5 },
      { digits: 3 },
      { type: 1 },
      { type: 3 },
      { secret: new Uint8Array() },
    ])
      expect([otp, parseGoogleMigration(link([{ ...jonas, ...otp }]))]).toMatchObject([
        otp,
        { ok: true, value: [], skipped: 1 },
      ]);
  });

  it("takes the issuer from the name when it is not given on its own", () => {
    const named = (name: string, issuer?: string) =>
      parseGoogleMigration(
        link([{ secret: KEY, name, ...(issuer === undefined ? {} : { issuer }) }]),
      );
    expect(named("Sparkasse:sandra")).toMatchObject({
      value: [{ content: { title: "Sparkasse", fields: [{ value: "sandra" }, {}] } }],
    });
    expect(named("Sparkasse:sandra", " Sparkasse ")).toMatchObject({
      value: [{ content: { title: "Sparkasse", fields: [{ value: "sandra" }, {}] } }],
    });
    expect(named("Sparkasse :sandra", "Sparkasse")).toMatchObject({
      value: [{ content: { title: "Sparkasse", fields: [{ value: "sandra" }, {}] } }],
    });
    expect(named("Alt:sandra", "Neu")).toMatchObject({
      value: [{ content: { title: "Neu", fields: [{ value: "Alt:sandra" }, {}] } }],
    });
    expect(named("sandra")).toMatchObject({
      value: [{ content: { title: "sandra", fields: [{ value: "sandra" }, {}] } }],
    });
    expect(named(":sandra")).toMatchObject({
      value: [{ content: { title: "sandra", fields: [{ value: "sandra" }, {}] } }],
    });
  });

  it("reads a field that comes twice as its last value, and skips unknown fields", () => {
    const params = otpParameters(jonas);
    const payload = message([
      [1, params],
      [6, "unbekannt"],
      [3, 2],
      [3, 1],
    ]);
    expect(codes(migrationLink(payload))).toEqual([`${DATEV}&algorithm=SHA1&digits=6&period=30`]);
    // An account with a field of the wrong kind reads that field as unset
    const wrongKinds = message([
      [
        1,
        message([
          [1, KEY],
          [2, "jonas"],
          [3, "DATEV"],
          [4, "x"],
          [6, new Uint8Array([2])],
        ]),
      ],
    ]);
    expect(codes(migrationLink(wrongKinds))).toEqual([
      `${DATEV}&algorithm=SHA1&digits=6&period=30`,
    ]);
    const numberSecret = message([
      [
        1,
        message([
          [1, 5],
          [2, "jonas"],
        ] as Field[]),
      ],
    ]);
    expect(parseGoogleMigration(migrationLink(numberSecret))).toMatchObject({
      value: [],
      skipped: 1,
    });
    // A payload field 1 of the wrong kind is no account
    expect(parseGoogleMigration(migrationLink(message([[1, 5]])))).toEqual({
      ok: true,
      value: [],
      skipped: 0,
    });
  });

  it("takes Base64 as people paste it: a + read as a space, URL-safe letters, no padding", () => {
    // A key whose Base64 needs "+", "/" and padding
    const plain = link([
      {
        ...jonas,
        secret: new Uint8Array([0xfb, 0xef, 0xbe, 0xff, 0xfb, 0xef, 0xbe, 0xff, 0xfb, 0xef, 0xbe]),
      },
    ]);
    const data = decodeURIComponent(plain.split("data=")[1] ?? "");
    expect([data.includes("+"), data.includes("/"), data.endsWith("=")]).toEqual([
      true,
      true,
      true,
    ]);
    const variants = [
      `otpauth-migration://offline?data=${data}`,
      `otpauth-migration://offline?data=${data.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`,
      `  ${plain}  `,
    ];
    expect(codes(plain)).toEqual([
      "otpauth://totp/DATEV:jonas?secret=7PX35773567P767PXY&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
    ]);
    for (const variant of variants)
      expect([variant, codes(variant)]).toEqual([variant, codes(plain)]);
  });

  it("refuses what is no migration link", () => {
    const data = plainData(link([jonas]));
    const refused = [
      "",
      "  \n ",
      `${DATEV}&algorithm=SHA1`,
      `otpauth-migration://online?data=${data}`,
      `otpauth-migrations://offline?data=${data}`,
      "otpauth-migration://offline",
      "otpauth-migration://offline?data=",
      "otpauth-migration://offline?data=%%%",
      "otpauth-migration://offline?data=!!!!",
      `otpauth-migration://offline?data=${btoa("\x08")}`,
      `${link([jonas])}\nkein Link`,
    ];
    for (const input of refused)
      expect([input, parseGoogleMigration(input)]).toEqual([
        input,
        { ok: false, error: "wrong-format" },
      ]);
    expect(parseGoogleMigration(new Uint8Array([0xff]))).toEqual({ ok: false, error: "not-text" });
    // A payload whose account is broken inside
    expect(codes(migrationLink(message([[1, new Uint8Array([0x08])]])))).toBe("wrong-format");
  });

  it("says where a link belongs, for counting the codes still to come", () => {
    expect(migrationBatch(` ${link([jonas], { size: 3, index: 2, id: 42 })} `)).toEqual({
      id: 42,
      index: 2,
      size: 3,
    });
    // An export of one code, written before batches, has a size of 0
    expect(migrationBatch(migrationLink(message([[1, otpParameters(jonas)]])))).toEqual({
      id: 0,
      index: 0,
      size: 1,
    });
    expect(migrationBatch(DATEV)).toBeUndefined();
  });
});

const plainData = (link: string) => link.split("data=")[1] ?? "";
