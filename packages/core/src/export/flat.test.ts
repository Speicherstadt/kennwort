import { describe, expect, it } from "vitest";
import { flatEntry } from "./flat.ts";
import { BUERO, TECHNIK } from "./test/weber.ts";

const [banking, alarm] = BUERO.entries as [(typeof BUERO.entries)[0], (typeof BUERO.entries)[0]];
const [wifi] = TECHNIK.entries as [(typeof TECHNIK.entries)[0]];

describe("flatEntry", () => {
  it("puts the template fields in their columns and the rest into named extra fields", () => {
    expect(flatEntry(banking)).toEqual({
      title: "Online-Banking Sparkasse",
      type: "login",
      favorite: true,
      tags: ["Bank", "Büro"],
      username: "jonas.weber",
      password: "Sp@rkasse-2026!",
      urls: ["https://banking.sparkasse.example", "https://app.sparkasse.example"],
      totp: "otpauth://totp/Sparkasse:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Sparkasse",
      notes: 'TAN per App\nKontakt: Filiale "Mitte"',
      fields: [
        { name: "Kundennummer", value: "7788-1", secret: false },
        { name: "PIN", value: "4711", secret: true },
      ],
      // Oldest first; the title's history is no password
      passwords: [
        { value: "Sp@rkasse-2024!", replacedAt: 1_730_000_000 },
        { value: "Sp@rkasse-2025!", replacedAt: 1_760_000_000 },
      ],
    });
  });

  it("keeps a type's other fields as extra ones and its password in the column", () => {
    const flat = flatEntry(wifi);
    expect(flat.password).toBe("Kupfer & <Rohr> 18");
    expect(flat.fields).toEqual([
      { name: "SSID", value: "Weber-Werkstatt", secret: false },
      { name: "Sicherheit", value: "WPA3", secret: false },
    ]);
    expect(flatEntry(alarm)).toMatchObject({ type: "note", notes: alarm.fields[0]?.value });
  });

  it("takes every numbered link, however many", () => {
    const flat = flatEntry({
      ...banking,
      fields: ["website", "website-2", "website-12"].map((id) => ({
        id,
        name: "Website",
        value: `https://${id}.test`,
        kind: "url" as const,
      })),
    });
    expect(flat.urls).toEqual([
      "https://website.test",
      "https://website-2.test",
      "https://website-12.test",
    ]);
    expect(flat.fields).toEqual([]);
  });

  it("takes the first filled field of an ID; a second one, a nameless one and a code stay", () => {
    const flat = flatEntry({
      ...banking,
      fields: [
        { id: "username", name: "Benutzername", value: "", kind: "text" },
        { id: "username", name: "Benutzername", value: "anna", kind: "text" },
        { id: "username-2", name: "Zweites Konto", value: "max", kind: "text" },
        { id: "totp", name: "Code", value: "otpauth://a", kind: "totp" },
        { id: "totp", name: "Code 2", value: "otpauth://b", kind: "totp" },
        { id: "password", name: "Passwort", value: "eins", kind: "secret" },
        { id: "password", name: "Passwort", value: "zwei", kind: "secret" },
        { id: "note", name: "Notiz", value: "erste", kind: "note" },
        { id: "note", name: "Notiz", value: "zweite", kind: "note" },
        { id: "websites", name: "  ", value: "kein Link", kind: "text" },
        { id: "website-x", name: "Link", value: "auch keiner", kind: "url" },
        { id: "xwebsite", name: "Fremd", value: "ebenso keiner", kind: "url" },
        { id: "empty", name: "Leer", value: "", kind: "text" },
      ],
      history: [{ fieldId: "password", value: "", replacedAt: 3 }],
    });
    expect(flat).toMatchObject({ username: "anna", totp: "otpauth://a", password: "eins" });
    expect(flat.notes).toBe("erste");
    expect(flat.urls).toEqual([]);
    expect(flat.passwords).toEqual([]);
    expect(flat.fields).toEqual([
      { name: "Zweites Konto", value: "max", secret: false },
      { name: "Code 2", value: "otpauth://b", secret: true },
      { name: "Passwort", value: "zwei", secret: true },
      { name: "Notiz", value: "zweite", secret: false },
      { name: "websites", value: "kein Link", secret: false },
      { name: "Link", value: "auch keiner", secret: false },
      { name: "Fremd", value: "ebenso keiner", secret: false },
    ]);
  });
});
