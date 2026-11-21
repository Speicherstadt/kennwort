import { describe, expect, it } from "vitest";
import { parseProtonPassJson } from "./protonpass-json.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Proton Pass JSON (K-502)", () => {
  it("reads a real export: every kind, own fields and sections, without the trash", () => {
    expect(compact(parseProtonPassJson(fixture("protonpass.json")))).toEqual([
      {
        type: "login",
        title: "Großhändler-Portal",
        fields: [
          ["username", "Username", "jonas.weber", "text"],
          ["password", "Password", "Gr0ssh@ndel!", "secret"],
          ["website", "Website", "https://portal.grosshandel.example", "url"],
          ["website-2", "Website", "https://app.grosshandel.example", "url"],
          ["totp", "One-time code", "otpauth://totp/Portal:jonas?secret=JBSWY3DPEHPK3PXP", "totp"],
          ["field-1", "Email", "jonas@weber-haustechnik.example", "email"],
          ["field-2", "Kundennummer", "40711", "text"],
          ["field-3", "Lager-PIN", "2468", "secret"],
          ["field-4", "Zweiter Code", "otpauth://totp/Zwei?secret=GEZDGNBVGY3TQOJQ", "totp"],
          ["field-5", "Vertragsbeginn", "2024-03-01", "text"],
          ["note", "Notes", "Kundennummer 40711\nLieferung ins Lager", "note"],
        ],
        favorite: true,
        folders: ["Weber Haustechnik"],
      },
      {
        type: "login",
        title: "Webmail Sandra",
        fields: [
          ["username", "Username", "sandra@weber-haustechnik.example", "text"],
          ["password", "Password", "Ma1l-Sandra", "secret"],
        ],
        folders: ["Weber Haustechnik"],
      },
      {
        type: "card",
        title: "Firmenkarte",
        fields: [
          ["holder", "Cardholder", "Jonas Weber", "text"],
          ["number", "Card number", "4111111111111111", "secret"],
          ["expiry", "Expiry", "08/2028", "text"],
          ["cvc", "CVC", "123", "secret"],
          ["pin", "PIN", "1234", "secret"],
          ["note", "Notes", "Tankstellen", "note"],
        ],
        folders: ["Weber Haustechnik"],
      },
      {
        type: "wifi",
        title: "WLAN Büro",
        fields: [
          ["ssid", "SSID", "Weber-Buero", "text"],
          ["password", "Password", "Heizung&Sanitaer2026", "secret"],
          ["security", "Security", "WPA2", "text"],
        ],
        folders: ["Weber Haustechnik"],
      },
      {
        type: "identity",
        title: "Max Mustermann",
        fields: [
          ["name", "Name", "Max Mustermann", "text"],
          ["email", "Email", "max@weber-haustechnik.example", "email"],
          ["phone", "Phone", "+49 170 1234567", "text"],
          [
            "address",
            "Address",
            "Weber Haustechnik\nIndustriestraße 12\n28199 Bremen\nDeutschland",
            "note",
          ],
        ],
        folders: ["Persönlich"],
      },
      {
        type: "ssh-key",
        title: "Server Fernwartung",
        fields: [
          [
            "private-key",
            "Private key",
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----",
            "secret",
          ],
          ["public-key", "Public key", "ssh-ed25519 AAAAC3Example max@weber", "note"],
          ["field-1", "Fingerprint", "SHA256:k3Yx0Example", "text"],
          ["field-2", "Host", "fernwartung.weber-haustechnik.example", "text"],
        ],
        folders: ["Persönlich"],
      },
      {
        type: "note",
        title: "Notiz Werkzeug",
        fields: [["note", "Notes", "Akkuschrauber im Transporter 2", "note"]],
        folders: ["Persönlich"],
      },
      {
        type: "note",
        title: "Newsletter-Alias",
        fields: [["field-1", "Alias", "weber.newsletter@passmail.example", "email"]],
        folders: ["Persönlich"],
      },
    ]);
  });
  it("reports the encrypted export", () => {
    expect(parseProtonPassJson('{"encrypted":true,"vaults":{}}')).toEqual({
      ok: false,
      error: "encrypted",
    });
  });

  it("reads Wi-Fi without or with an unknown security and fields without data", () => {
    const item = (content: object | null, extraFields: object[] = []) => ({
      data: { type: "wifi", metadata: { name: "W", note: "" }, extraFields, content },
    });
    const json = JSON.stringify({
      vaults: {
        v: {
          name: "",
          items: [
            item({ ssid: "a" }),
            item({ ssid: "b", security: 9 }),
            item(null, [
              { fieldName: "F", type: "text", data: "kaputt" },
              { fieldName: "T", type: "totp", data: "kaputt" },
              { fieldName: "Z", type: "timestamp", data: "kaputt" },
            ]),
            item({ security: 1 }),
            item({ security: 3 }),
            item({ security: 4 }),
          ],
        },
      },
    });
    expect(compact(parseProtonPassJson(json))).toEqual([
      { type: "wifi", title: "W", fields: [["ssid", "SSID", "a", "text"]] },
      { type: "wifi", title: "W", fields: [["ssid", "SSID", "b", "text"]] },
      { type: "wifi", title: "W", fields: [] },
      { type: "wifi", title: "W", fields: [["security", "Security", "WPA", "text"]] },
      { type: "wifi", title: "W", fields: [["security", "Security", "WPA3", "text"]] },
      { type: "wifi", title: "W", fields: [["security", "Security", "WEP", "text"]] },
    ]);
  });

  it("leaves a card expiry it cannot read as written", () => {
    const json = JSON.stringify({
      vaults: {
        v: {
          name: "",
          items: [
            ...["x2028-08", "2028-089"].map((expirationDate) => ({
              data: { type: "creditCard", metadata: { name: "K" }, content: { expirationDate } },
            })),
          ],
        },
      },
    });
    expect(compact(parseProtonPassJson(json))).toEqual([
      { type: "card", title: "K", fields: [["expiry", "Expiry", "x2028-08", "text"]] },
      { type: "card", title: "K", fields: [["expiry", "Expiry", "2028-089", "text"]] },
    ]);
  });

  it("refuses JSON of another shape", () => {
    expect(parseProtonPassJson('{"vaults":[]}')).toEqual({ ok: false, error: "wrong-format" });
  });
});
