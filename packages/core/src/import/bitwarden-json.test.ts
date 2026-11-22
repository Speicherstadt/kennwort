import { describe, expect, it } from "vitest";
import { parseBitwardenJson } from "./bitwarden-json.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Bitwarden JSON (K-502)", () => {
  it("reads a personal export: every item type, own fields, history", () => {
    expect(compact(parseBitwardenJson(fixture("bitwarden.json")))).toEqual([
      {
        type: "login",
        title: "Online-Banking Sparkasse",
        fields: [
          ["username", "Username", "jonas.weber", "text"],
          ["password", "Password", "Sp@rkasse-2026!", "secret"],
          ["website", "Website", "https://banking.sparkasse.example", "url"],
          ["website-2", "Website", "https://app.sparkasse.example", "url"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/Sparkasse:jonas.weber?secret=JBSWY3DPEHPK3PXP",
            "totp",
          ],
          ["field-1", "Kundennummer", "7788-1", "text"],
          ["field-2", "Online-PIN", "90210", "secret"],
          ["field-3", "Push-TAN aktiv", "true", "text"],
          ["note", "Notes", "TAN per App\nKontakt: Filiale Mitte", "note"],
        ],
        favorite: true,
        folders: ["Büro"],
        history: [["password", "Sp@rkasse-2025!", 1762157700000]],
      },
      {
        type: "note",
        title: "Alarmanlage Lager",
        fields: [["note", "Notes", "Code 2580\nÄndern nach Personalwechsel", "note"]],
      },
      {
        type: "card",
        title: "Firmenkreditkarte",
        fields: [
          ["holder", "Cardholder", "Jonas Weber", "text"],
          ["number", "Card number", "4111111111111111", "secret"],
          ["expiry", "Expiry", "08/2028", "text"],
          ["cvc", "CVC", "123", "secret"],
        ],
        folders: ["Büro"],
      },
      {
        type: "identity",
        title: "Anna Schmidt",
        fields: [
          ["name", "Name", "Frau Anna Schmidt", "text"],
          ["email", "Email", "anna@weber-haustechnik.example", "email"],
          ["phone", "Phone", "+49 421 123456", "text"],
          ["address", "Address", "Weber Haustechnik\nIndustriestraße 12\n28199 Bremen\nDE", "note"],
          ["field-1", "Username", "anna", "text"],
          ["field-2", "Licence number", "B072RRE2I55", "secret"],
        ],
      },
      {
        type: "ssh-key",
        title: "Server Fernwartung",
        fields: [
          [
            "private-key",
            "Private key",
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----",
            "secret",
          ],
          [
            "public-key",
            "Public key",
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample max@weber",
            "note",
          ],
          ["field-1", "Fingerprint", "SHA256:k3Yx0Example", "text"],
          ["note", "Notes", "Nur Max", "note"],
        ],
        folders: ["Technik/Fernwartung"],
      },
    ]);
  });
  it("reads an organisation's export with collections", () => {
    expect(compact(parseBitwardenJson(fixture("bitwarden-org.json")))).toEqual([
      {
        type: "login",
        title: "DATEV Unternehmen online",
        fields: [
          ["username", "Username", "anna@weber-haustechnik.example", "text"],
          ["password", "Password", "D@tev-Anna", "secret"],
        ],
        folders: ["Alle Mitarbeiter", "Buchhaltung"],
      },
      {
        type: "login",
        title: "shop.example",
        fields: [
          ["username", "Username", "einkauf", "text"],
          ["password", "Password", "Eink@uf1", "secret"],
          ["website", "Website", "https://shop.example/login", "url"],
        ],
      },
    ]);
  });
  it("reports password-protected and account-restricted exports", () => {
    const encrypted = { ok: false, error: "encrypted" };
    expect(parseBitwardenJson('{"encrypted":true,"items":[]}')).toEqual({
      ok: false,
      error: "account-encrypted",
    });
    expect(parseBitwardenJson('{"encrypted":true,"passwordProtected":true}')).toEqual(encrypted);
    expect(parseBitwardenJson('{"passwordProtected":true}')).toEqual(encrypted);
  });

  it("reads items whose parts are missing or null", () => {
    const json = JSON.stringify({
      items: [
        { type: 1, name: "L" },
        { type: 3, name: "C", card: null },
        { type: 4, name: "I" },
        { type: 4, name: "P", identity: { ssn: "123", passportNumber: "C01X" } },
        {
          type: 2,
          name: "F",
          fields: [
            { name: "Verknüpft", value: "x", type: 3 },
            { name: "Neu", value: "y", type: 4 },
          ],
        },
        { type: 5, name: "S" },
        { type: 9, name: "Neu", passwordHistory: [{ password: "alt", lastUsedDate: null }] },
      ],
    });
    expect(compact(parseBitwardenJson(json))).toEqual([
      { type: "login", title: "L", fields: [] },
      { type: "card", title: "C", fields: [] },
      { type: "identity", title: "I", fields: [] },
      {
        type: "identity",
        title: "P",
        fields: [
          ["field-1", "Social security number", "123", "secret"],
          ["field-2", "Passport number", "C01X", "secret"],
        ],
      },
      { type: "note", title: "F", fields: [["field-1", "Neu", "y", "text"]] },
      { type: "ssh-key", title: "S", fields: [] },
      { type: "login", title: "Neu", fields: [], history: [["password", "alt", 0]] },
    ]);
  });

  it("keeps a history date before 1970 at zero", () => {
    const json = JSON.stringify({
      items: [
        {
          type: 2,
          name: "N",
          passwordHistory: [{ password: "a", lastUsedDate: "1969-12-31T00:00:00Z" }],
        },
      ],
    });
    expect(compact(parseBitwardenJson(json))).toEqual([
      { type: "note", title: "N", fields: [], history: [["password", "a", 0]] },
    ]);
  });

  it("refuses JSON of another shape and text that is no JSON", () => {
    expect(parseBitwardenJson('{"items":{}}')).toEqual({ ok: false, error: "wrong-format" });
    expect(parseBitwardenJson("{")).toEqual({ ok: false, error: "bad-json" });
    expect(parseBitwardenJson(new Uint8Array([0xff]))).toEqual({ ok: false, error: "not-text" });
  });
});
