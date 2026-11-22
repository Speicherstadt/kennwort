import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCxfJson } from "./cxf-json.ts";
import { field, file, item, parse } from "./test/cxf.ts";
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

  it("trims the item's addresses", () => {
    expect(parse(item([], { scope: { urls: [" https://a.example "] } }))).toEqual([
      {
        type: "note",
        title: "Eintrag",
        fields: [["website", "Website", "https://a.example", "url"]],
      },
    ]);
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
