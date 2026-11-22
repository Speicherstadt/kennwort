import { describe, expect, it } from "vitest";
import { parseOnePassword1pux, parseOnePasswordData } from "./onepassword-1pux.ts";
import { compact, fixture } from "./test/helpers.ts";
import { buildZip } from "./test/zip.ts";

// K-502 Teil 2: 1Password's 1PUX, after 1Password's format description and the test data of
// Bitwarden's 1PUX importer. The fixture has one item of each category Kennwort maps, and one it
// does not (a bank account), in two accounts.
const EXPECTED = [
  {
    type: "login",
    title: "Großhandel-Portal",
    fields: [
      ["username", "Username", "jonas@weber-haustechnik.example", "text"],
      ["password", "Password", "Sommer2026!Heizung", "secret"],
      ["website", "Website", "https://portal.sanitaer-grosshandel.example", "url"],
      ["website-2", "Website", "https://bestellung.sanitaer-grosshandel.example", "url"],
      ["field-1", "kundennummer", "K-4711", "text"],
      ["field-2", "pin", "2468", "secret"],
      [
        "totp",
        "One-time code",
        "otpauth://totp/Grosshandel:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Grosshandel",
        "totp",
      ],
      ["field-3", "Shop-Link", "https://shop.sanitaer-grosshandel.example", "url"],
      ["note", "Notes", "Bestellungen über 500 € gibt Anna frei.\nRabattstufe B.", "note"],
    ],
    tags: ["Einkauf", "Technik/Fernwartung"],
    favorite: true,
    folders: ["Büro"],
    history: [
      ["password", "Winter2025!Heizung", 1764547200000],
      ["password", "Herbst2025!Heizung", 1759276800000],
    ],
  },
  {
    type: "login",
    title: "Drucker Büro (Admin)",
    fields: [
      ["password", "Password", "Toner#2026", "secret"],
      ["website", "Website", "http://drucker.buero.weber-haustechnik.example", "url"],
    ],
    folders: ["Büro"],
  },
  {
    type: "login",
    title: "Kundenserver Fernwartung",
    fields: [
      ["website", "Website", "https://fernwartung.weber-haustechnik.example", "url"],
      ["username", "Username", "max.service", "text"],
      ["password", "Password", "Wartung!2026", "secret"],
      ["field-1", "console password", "Konsole#Max", "secret"],
    ],
    folders: ["Büro"],
  },
  {
    type: "login",
    title: "Heizungsdaten-DB",
    fields: [
      ["field-1", "type", "postgresql", "text"],
      ["field-2", "server", "db.weber-haustechnik.example", "text"],
      ["username", "Username", "heizung", "text"],
      ["password", "Password", "Kessel-2026", "secret"],
    ],
    folders: ["Büro"],
  },
  {
    type: "card",
    title: "Firmenkreditkarte",
    fields: [
      ["holder", "Cardholder", "Sandra Weber", "text"],
      ["field-1", "type", "visa", "text"],
      ["number", "Card number", "4111111111111111", "secret"],
      ["cvc", "CVC", "737", "secret"],
      ["expiry", "Expiry", "03/2029", "text"],
      ["field-2", "valid from", "03/2024", "text"],
      ["field-3", "kartenkonto", "Geschäftskonto", "text"],
      ["field-4", "Contact Information", "Sparkasse Musterstadt", "text"],
      ["field-5", "phone (local)", "040 1234567", "text"],
      ["pin", "PIN", "1357", "secret"],
    ],
    tags: ["Finanzen"],
    folders: ["Büro"],
  },
  {
    type: "identity",
    title: "Anna Weber",
    fields: [
      ["name", "Name", "Anna M. Weber", "text"],
      ["field-1", "sex", "female", "text"],
      ["field-2", "birth date", "1986-01-01", "text"],
      ["field-3", "company", "Weber Haustechnik", "text"],
      ["address", "Address", "Hafenstraße 12\n20457 Musterstadt\nHamburg\nDE", "note"],
      ["phone", "Phone", "040 7654321", "text"],
      ["field-4", "cell", "0170 1234567", "text"],
      ["email", "Email", "anna@weber-haustechnik.example", "email"],
      ["field-5", "work email", "buero@weber-haustechnik.example", "email"],
    ],
    folders: ["Büro"],
  },
  {
    type: "wifi",
    title: "Werkstatt-WLAN",
    fields: [
      ["field-1", "base station name", "Werkstatt-Router", "text"],
      ["field-2", "base station password", "Router!Admin", "secret"],
      ["ssid", "SSID", "Weber-Werkstatt", "text"],
      ["security", "Security", "WPA2", "text"],
      ["password", "Password", "Werkbank-2026", "secret"],
    ],
    folders: ["Büro"],
  },
  {
    type: "api-key",
    title: "Großhandel-API",
    fields: [
      ["field-1", "username", "weber-haustechnik", "text"],
      ["key", "Key", "gh_live_7Kq2xW9mZ4", "secret"],
      ["field-2", "type", "bearer", "text"],
      ["website", "Website", "https://api.sanitaer-grosshandel.example", "url"],
      ["field-3", "expires", "2028-01-01", "text"],
    ],
    folders: ["Büro"],
  },
  {
    type: "ssh-key",
    title: "Fernwartung Max",
    fields: [
      [
        "private-key",
        "Private key",
        "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIDn1BgTb\n-----END PRIVATE KEY-----\n",
        "secret",
      ],
      [
        "public-key",
        "Public key",
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJayncUV max@weber-haustechnik",
        "note",
      ],
      ["field-1", "Fingerprint", "SHA256:/9qSxXuic8kaVBhwv3c8PuetiEpaOgIp7xHNCbcSuN8", "text"],
    ],
    folders: ["Büro"],
  },
  {
    type: "note",
    title: "Alarmanlage Werkstatt",
    fields: [["note", "Notes", "Code 4711, Sandra hat den Ersatzschlüssel.", "note"]],
    folders: ["Büro"],
  },
  {
    type: "note",
    title: "Geschäftskonto",
    fields: [
      ["field-1", "bank name", "Sparkasse Musterstadt", "text"],
      ["field-2", "name on account", "Weber Haustechnik", "text"],
      ["field-3", "IBAN", "DE02120300000000202051", "text"],
      ["field-4", "telephone PIN", "9753", "secret"],
    ],
    tags: ["Finanzen"],
    folders: ["Büro"],
  },
  {
    type: "login",
    title: "angelverein.example",
    fields: [
      ["username", "Username", "max@weber-haustechnik.example", "text"],
      ["password", "Password", "Angeln!See", "secret"],
      ["website", "Website", "https://angelverein.example", "url"],
    ],
    folders: ["Privat"],
  },
];

/** export.data with one item of this content */
const oneItem = (item: object) =>
  JSON.stringify({ accounts: [{ vaults: [{ attrs: { name: "Büro" }, items: [item] }] }] });

const sectionWith = (value: object) => ({
  categoryUuid: "003",
  overview: { title: "Notiz" },
  details: { sections: [{ title: "", fields: [{ title: "Wert", id: "x", value }] }] },
});

describe("1Password 1PUX (K-502)", () => {
  it("reads export.data: every category, sections, the login form, tags, favorites, history", () => {
    expect(compact(parseOnePasswordData(fixture("onepassword-1pux.json")))).toEqual(EXPECTED);
  });

  it("reads the 1PUX itself, stored and deflated files, without the attachments", async () => {
    expect(compact(await parseOnePassword1pux(fixture("onepassword.1pux")))).toEqual(EXPECTED);
  });

  it("reads values in their own forms and leaves out what it cannot read", () => {
    const value = (v: object) => {
      const result = compact(parseOnePasswordData(oneItem(sectionWith(v))));
      return typeof result === "string" ? result : result[0]?.fields;
    };
    expect(value({ date: 1e20 })).toEqual([]);
    expect(value({ date: null, string: "a" })).toEqual([["field-1", "Wert", "a", "text"]]);
    expect(value({ monthYear: "2029-03", string: "b" })).toEqual([
      ["field-1", "Wert", "b", "text"],
    ]);
    expect(value({ url: "https://weber-haustechnik.example" })).toEqual([
      ["field-1", "Wert", "https://weber-haustechnik.example", "url"],
    ]);
    expect(value({ address: { street: "Hafenstraße 12", zip: "20457", city: "Hamburg" } })).toEqual(
      [["field-1", "Wert", "Hafenstraße 12\n20457 Hamburg", "note"]],
    );
    expect(value({ totp: "otpauth://totp/x?secret=A" })).toEqual([
      ["field-1", "Wert", "otpauth://totp/x?secret=A", "totp"],
    ]);
  });

  it("refuses what is not a 1PUX", async () => {
    expect(parseOnePasswordData('{"items":[]}')).toEqual({ ok: false, error: "wrong-format" });
    expect(parseOnePasswordData("{")).toEqual({ ok: false, error: "bad-json" });
    const other = buildZip([{ name: "export.attributes", data: "{}" }]);
    expect(await parseOnePassword1pux(other.bytes)).toEqual({ ok: false, error: "wrong-format" });
    expect(await parseOnePassword1pux(fixture("onepassword-1pux.json"))).toEqual({
      ok: false,
      error: "bad-zip",
    });
  });
});
