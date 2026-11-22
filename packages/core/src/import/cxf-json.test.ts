import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCxfJson } from "./cxf-json.ts";
import { compact, fixture, fixtureText } from "./test/helpers.ts";

const b64url = (text: string) => Buffer.from(text).toString("base64url");

/** The F-12 key of the fixture's P-256 passkey, worked out by node:crypto, not by the parser */
const portalKey = () => {
  const header = JSON.parse(fixtureText("cxf.json"));
  const portal = header.accounts[0].items.find((i: { title: string }) =>
    i.title.startsWith("Groß"),
  );
  const der = Buffer.from(portal.credentials[0].key, "base64url");
  const { d } = createPrivateKey({ key: der, format: "der", type: "pkcs8" }).export({
    format: "jwk",
  });
  return Buffer.concat([Buffer.of(1), Buffer.from(d ?? "", "base64url")]).toString("base64url");
};

/** A CXF file of one account with these items and collections */
const file = (items: object[], collections: object[] = [], major = 1) =>
  JSON.stringify({
    version: { major, minor: 0 },
    exporterRpId: "manager.example",
    exporterDisplayName: "Beispiel",
    timestamp: 0,
    accounts: [{ id: "YQ", username: "a", email: "a@b.example", collections, items }],
  });
const item = (credentials: unknown[], more: object = {}) => ({
  id: "aXRlbQ",
  title: "Eintrag",
  credentials,
  ...more,
});
const field = (fieldType: string, value: string, label?: string) => ({ fieldType, value, label });
const parse = (...items: object[]) => compact(parseCxfJson(file(items)));

describe("FIDO Credential Exchange Format (K-502)", () => {
  it("reads every kind of credential, collections as folders and the ES256 passkey", () => {
    const result = parseCxfJson(fixture("cxf.json"));
    expect(result.ok && [result.skipped, result.skippedPasskeys]).toEqual([1, 2]);
    expect(compact(result)).toEqual([
      {
        type: "login",
        title: "DATEV Unternehmen online",
        fields: [
          ["username", "Username", "anna.weber", "text"],
          ["password", "Password", "Kessel-Rohr-Ventil-26", "secret"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/DATEV:anna.weber?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
            "totp",
          ],
          ["website", "Website", "https://www.datev.de", "url"],
          ["field-1", "Android app", "de.datev.uo", "text"],
          ["note", "Notes", "Mandant 4711\nBerater: Steuerbüro Kranz", "note"],
        ],
        tags: ["Steuern"],
        favorite: true,
        folders: ["Büro"],
      },
      {
        type: "card",
        title: "Sparkasse Firmenkarte",
        fields: [
          ["holder", "Cardholder", "Jonas Weber", "text"],
          ["number", "Card number", "4111111111111111", "secret"],
          ["expiry", "Expiry", "09/2028", "text"],
          ["cvc", "CVC", "123", "secret"],
          ["pin", "PIN", "4711", "secret"],
          ["field-1", "Card type", "Visa", "text"],
        ],
        folders: ["Büro/Banken"],
      },
      {
        type: "wifi",
        title: "Lager-WLAN",
        fields: [
          ["ssid", "SSID", "Weber-Lager", "text"],
          ["password", "Password", "Rohr-Zange-Lager-2026", "secret"],
          ["security", "Security", "wpa2-personal", "text"],
          ["field-1", "Hidden", "false", "text"],
        ],
        folders: ["Technik"],
      },
      {
        type: "passkey",
        title: "Großhandel-Portal",
        fields: [
          ["rp-id", "rp-id", "shop.grosshandel.example", "text"],
          ["username", "username", "max@weber-haustechnik.example", "text"],
          ["display-name", "display-name", "max@weber-haustechnik.example", "text"],
          ["user-handle", "user-handle", b64url("user-max@weber-haustechnik.example"), "text"],
          ["credential-id", "credential-id", b64url("cred-shop.grosshandel.example"), "text"],
          ["private-key", "private-key", portalKey(), "secret"],
          ["counter", "counter", "0", "text"],
        ],
      },
      {
        type: "ssh-key",
        title: "Server Lager",
        fields: [
          [
            "private-key",
            "Private key",
            expect.stringMatching(/^-----BEGIN PRIVATE KEY-----\n/),
            "secret",
          ],
          ["field-1", "Key type", "ssh-ed25519", "text"],
          ["field-2", "Comment", "sandra@lager", "text"],
        ],
        folders: ["Technik"],
      },
      {
        type: "login",
        title: "Heizungs-Hersteller",
        fields: [
          ["username", "Username", "sandra", "text"],
          ["password", "Password", "Pumpe-Ventil-2026", "secret"],
        ],
      },
      {
        type: "identity",
        title: "Firmendaten",
        fields: [
          ["name", "Name", "Jonas Weber", "text"],
          ["address", "Address", "Hafenstraße 12\n20457 Hamburg\nDE", "note"],
          ["phone", "Phone", "+49 40 123456", "text"],
          ["field-1", "USt-IdNr.", "DE123456789", "text"],
          ["field-2", "Bank-PIN", "998877", "secret"],
          ["field-3", "Kontakt", "buero@weber-haustechnik.example", "email"],
        ],
      },
      {
        type: "api-key",
        title: "Wetter-API",
        fields: [
          ["key", "Key", "wx_live_4711", "secret"],
          ["website", "Website", "https://api.wetter.example", "url"],
          ["username", "Username", "weber-haustechnik", "text"],
          ["field-1", "Key type", "Bearer", "text"],
          ["field-2", "Expiry date", "2027-06-30", "text"],
        ],
      },
      {
        type: "login",
        title: "Alarmanlage",
        fields: [
          ["username", "Username", "lager", "text"],
          ["password", "Password", "Alarm-Lager-2026", "secret"],
        ],
      },
      {
        type: "identity",
        title: "Führerschein Max",
        fields: [
          ["field-1", "fullName", "Max Weber", "text"],
          ["field-2", "Führerscheinnummer", "B072RRE2I55", "text"],
          ["field-3", "licenseClass", "B, BE", "text"],
          ["field-4", "expiryDate", "2034-05-31", "text"],
        ],
      },
      {
        type: "note",
        title: "Ablage",
        fields: [["note", "Notes", "Verträge liegen im Schrank.", "note"]],
        folders: ["Büro"],
      },
    ]);
  });

  it("puts the private key of an SSH key into PEM lines of 64 characters", () => {
    const der = new Uint8Array(60).fill(0xfb);
    const pem = parse(
      item([{ type: "ssh-key", privateKey: Buffer.from(der).toString("base64url") }]),
    );
    const body = Buffer.from(der).toString("base64");
    expect(pem).toEqual([
      {
        type: "ssh-key",
        title: "Eintrag",
        fields: [
          [
            "private-key",
            "Private key",
            `-----BEGIN PRIVATE KEY-----\n${body.slice(0, 64)}\n${body.slice(64)}\n-----END PRIVATE KEY-----`,
            "secret",
          ],
        ],
      },
    ]);
    expect(parse(item([{ type: "ssh-key", privateKey: "nicht base64!" }]))).toEqual([
      {
        type: "ssh-key",
        title: "Eintrag",
        fields: [["private-key", "Private key", "nicht base64!", "secret"]],
      },
    ]);
  });

  it("reads every field of a card, an SSH key, an API key and a name", () => {
    const all = (type: string, members: string[]) =>
      item([{ type, ...Object.fromEntries(members.map((m) => [m, field("string", `${m}!`)])) }]);
    const fields = (entries: ReturnType<typeof parse>) =>
      typeof entries === "string" ? entries : entries.flatMap((e) => e.fields.map((f) => f[2]));
    expect(fields(parse(all("credit-card", ["validFrom"])))).toEqual(["validFrom!"]);
    expect(
      fields(parse(item([{ type: "credit-card", validFrom: field("year-month", "2025-01") }]))),
    ).toEqual(["01/2025"]);
    expect(
      fields(parse(all("ssh-key", ["creationDate", "expiryDate", "keyGenerationSource"]))),
    ).toEqual(["creationDate!", "expiryDate!", "keyGenerationSource!"]);
    expect(fields(parse(all("api-key", ["validFrom"])))).toEqual(["validFrom!"]);
    expect(
      fields(
        parse(
          all("person-name", [
            "title",
            "given",
            "givenInformal",
            "given2",
            "surnamePrefix",
            "surname",
            "surname2",
            "credentials",
            "generation",
          ]),
        ),
      ),
    ).toEqual([
      "title! given! given2! surnamePrefix! surname! surname2! generation!",
      "givenInformal!",
      "credentials!",
    ]);
    expect(compact(parseCxfJson(file([all("address", ["territory"])])))).toEqual([
      {
        type: "identity",
        title: "Eintrag",
        fields: [["address", "Address", "territory!", "note"]],
      },
    ]);
  });

  it("keeps a generated password secret and a passport's fields as own fields", () => {
    expect(
      parse(
        item([
          { type: "generated-password", password: "Rohr-1" },
          {
            type: "passport",
            id: "eA",
            passportNumber: field("string", "C01X00T47"),
            extensions: [],
          },
          { type: "identity-document", documentNumber: "T22000129", number: 7, list: [1] },
        ]),
      ),
    ).toEqual([
      {
        type: "login",
        title: "Eintrag",
        fields: [
          ["field-1", "Generated password", "Rohr-1", "secret"],
          ["field-2", "passportNumber", "C01X00T47", "text"],
          ["field-3", "documentNumber", "T22000129", "text"],
        ],
      },
    ]);
    expect(parse(item([{ type: "passport", passportNumber: "C01X00T47" }]))[0]).toMatchObject({
      type: "identity",
    });
    expect(parse(item([{ type: "identity-document", documentNumber: "1" }]))[0]).toMatchObject({
      type: "identity",
    });
  });

  it("names a custom field without a label and leaves out what is no field", () => {
    expect(
      parse(item([{ type: "custom-fields", fields: [field("number", "3"), "x", { value: 1 }] }])),
    ).toEqual([{ type: "note", title: "Eintrag", fields: [["field-1", "Field", "3", "text"]] }]);
    expect(parse(item([{ type: "custom-fields" }]))).toEqual([
      { type: "note", title: "Eintrag", fields: [] },
    ]);
  });

  it("takes a code's account as the username only where no login names one", () => {
    const totp = {
      type: "totp",
      secret: "JBSWY3DPEHPK3PXP",
      period: 30,
      digits: 6,
      algorithm: "sha256",
    };
    const link = "otpauth://totp/:anna?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=6&period=30";
    expect(parse(item([{ ...totp, username: " anna " }]))).toEqual([
      {
        type: "login",
        title: "Eintrag",
        fields: [
          ["username", "Username", "anna", "text"],
          ["totp", "One-time code", link, "totp"],
        ],
      },
    ]);
    expect(
      parse(
        item([
          { type: "basic-auth", username: field("string", "jonas") },
          { ...totp, username: "anna" },
        ]),
      ),
    ).toEqual([
      {
        type: "login",
        title: "Eintrag",
        fields: [
          ["username", "Username", "jonas", "text"],
          ["totp", "One-time code", link, "totp"],
        ],
      },
    ]);
  });

  it("counts codes it cannot work out and broken ones", () => {
    const result = parseCxfJson(
      file([
        item([
          { type: "totp", secret: "JBSWY3DPEHPK3PXP", period: 30, digits: 6, algorithm: "md5" },
          { type: "totp", secret: "JBSWY3DPEHPK3PXP", digits: 6, algorithm: "sha1" },
        ]),
      ]),
    );
    expect(result).toEqual({
      ok: true,
      value: [expect.objectContaining({ content: expect.objectContaining({ type: "login" }) })],
      skipped: 2,
      skippedPasskeys: 0,
    });
  });

  it("joins several notes and leaves files and item references out", () => {
    expect(
      parse(
        item([
          { type: "note", content: field("string", "eins") },
          { type: "item-reference", reference: { item: "eA" } },
          { type: "note", content: field("string", "zwei") },
        ]),
      ),
    ).toEqual([
      { type: "note", title: "Eintrag", fields: [["note", "Notes", "eins\n\nzwei", "note"]] },
    ]);
  });

  it("files an item in every collection that names it, nested ones by their path", () => {
    const collections = [
      {
        id: "MQ",
        title: " Büro ",
        items: [{ item: "aXRlbQ" }],
        subCollections: [
          { id: "Mg", title: "Banken", items: [{ item: "aXRlbQ", account: "YQ" }] },
          { id: "Mw", title: "", items: [{ item: "aXRlbQ" }] },
          { id: "NA", title: "Fremd", items: [{ item: "aXRlbQ", account: "Yg" }] },
          "kaputt",
        ],
      },
      { id: "NQ", title: "Technik", items: [{ item: "andere" }, 7] },
    ];
    expect(compact(parseCxfJson(file([item([])], collections)))).toEqual([
      { type: "note", title: "Eintrag", fields: [], folders: ["Büro", "Büro/Banken"] },
    ]);
  });

  it("reads deeply nested collections without recursion", () => {
    let nested: object = { id: "eA", title: "x", items: [{ item: "aXRlbQ" }] };
    for (let i = 0; i < 2000; i++)
      nested = { id: "eA", title: "", items: [], subCollections: [nested] };
    expect(compact(parseCxfJson(file([item([])], [nested])))).toEqual([
      { type: "note", title: "Eintrag", fields: [], folders: ["x"] },
    ]);
  });

  it("takes an item's favorite and tags into its passkeys too", () => {
    const der =
      "MEECAQAwEwYHKoZIzj0CAQYIKoZIzj0DAQcEJzAlAgEBBCABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fIA";
    const passkey = {
      type: "passkey",
      credentialId: "Y3JlZA",
      rpId: "a.example",
      username: "u",
      userDisplayName: "U",
      userHandle: "dQ",
      key: der,
    };
    const result = parseCxfJson(
      file(
        [item([passkey], { favorite: true, tags: [" b", "a", "b"] })],
        [{ id: "MQ", title: "Büro", items: [{ item: "aXRlbQ" }] }],
      ),
    );
    expect(compact(result)).toEqual([
      expect.objectContaining({
        type: "passkey",
        favorite: true,
        tags: ["a", "b"],
        folders: ["Büro"],
      }),
    ]);
    expect(result.ok && result.skippedPasskeys).toBe(0);
  });

  it("keeps an item with a passkey and a login as both, and counts a passkey it cannot keep", () => {
    const broken = { type: "passkey", rpId: "a.example", key: "AA" };
    const result = parseCxfJson(
      file([item([broken, { type: "basic-auth", username: field("string", "u") }])]),
    );
    expect(compact(result)).toEqual([
      { type: "login", title: "Eintrag", fields: [["username", "Username", "u", "text"]] },
    ]);
    expect(result.ok && [result.skipped, result.skippedPasskeys]).toEqual([0, 1]);
    expect(compact(parseCxfJson(file([item([broken, broken])])))).toEqual([]);
  });

  it("reads an item without a scope and ignores broken credentials and apps", () => {
    expect(
      parse(
        item([7, { type: "basic-auth", password: 5 }], {
          scope: { androidApps: [{ bundleId: 1 }] },
        }),
      ),
    ).toEqual([{ type: "login", title: "Eintrag", fields: [] }]);
  });

  it("sums what it leaves out over every account", () => {
    const totp = { type: "totp", secret: "", period: 30, digits: 6, algorithm: "sha1" };
    const account = { id: "YQ", username: "", email: "", collections: [], items: [item([totp])] };
    const json = JSON.stringify({ version: { major: 1, minor: 0 }, accounts: [account, account] });
    expect(parseCxfJson(json)).toMatchObject({ ok: true, skipped: 2, skippedPasskeys: 0 });
  });

  it("says when a file is of a later major version, or no CXF at all", () => {
    expect(parseCxfJson(file([], [], 2))).toEqual({ ok: false, error: "unsupported" });
    expect(parseCxfJson('{"accounts":[]}')).toEqual({ ok: false, error: "wrong-format" });
    expect(parseCxfJson("{")).toEqual({ ok: false, error: "bad-json" });
  });
});
