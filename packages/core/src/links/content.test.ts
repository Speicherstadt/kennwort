import { describe, expect, it } from "vitest";
import {
  decodeLinkContent,
  encodeLinkContent,
  LINK_FIELDS_MAX,
  LINK_LABEL_MAX,
  LINK_TITLE_MAX,
  LINK_VALUE_MAX,
  type LinkContent,
  linkContentOfEntry,
  linkContentOfText,
} from "./content.ts";

// K-601: what a one-time link carries, Weber Haustechnik's WLAN for a craftsman on site
// As the app shows an entry: labels in its language, and more that must not go along
const wlan = {
  type: "wifi",
  title: "WLAN Baustelle",
  fields: [
    { id: "ssid", label: "Netzwerk", value: "Weber-Baustelle", kind: "text" },
    { id: "password", label: "Passwort", value: "Rohr-Ventil-2026!", kind: "secret" },
    { id: "url", label: "Router", value: "http://192.168.0.1", kind: "url" },
    { id: "empty", label: "Leer", value: "", kind: "text" },
    { id: "totp", label: "Einmalcode", value: "otpauth://totp/x?secret=JBSWY3DP", kind: "totp" },
    { id: "note", label: "Notiz", value: "Zeile 1\nZeile 2", kind: "note" },
  ],
  tags: ["Baustelle"],
  favorite: true,
  history: [{ fieldId: "password", value: "alt", replacedAt: 1 }],
} as const;

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("linkContentOfEntry", () => {
  it("takes title and every field with a value but a TOTP seed; secrets stay hidden", () => {
    expect(linkContentOfEntry(wlan)).toEqual({
      version: 1,
      title: "WLAN Baustelle",
      fields: [
        { label: "Netzwerk", value: "Weber-Baustelle", secret: false },
        { label: "Passwort", value: "Rohr-Ventil-2026!", secret: true },
        { label: "Router", value: "http://192.168.0.1", secret: false },
        { label: "Notiz", value: "Zeile 1\nZeile 2", secret: false },
      ],
    });
  });

  // Review of K-601: a passkey's private key would let an outsider sign in as the account for good,
  // like a TOTP seed; only the encrypted JSON export carries passkeys (K-504)
  it("takes nothing of a passkey, its private key above all", () => {
    const passkey = {
      type: "passkey",
      title: "Großhandel",
      fields: [
        { label: "Website", value: "grosshandel.example", kind: "text" },
        { label: "Benutzername", value: "jonas@weber.example", kind: "text" },
        { label: "Privater Schlüssel", value: "AQkJCQkJ", kind: "secret" },
      ],
    } as const;
    expect(linkContentOfEntry(passkey).fields).toEqual([]);
  });

  it("carries nothing of the vault: no tags, favorite, history or IDs", () => {
    const text = new TextDecoder().decode(encodeLinkContent(linkContentOfEntry(wlan)));
    for (const absent of ['Baustelle"]', "favorite", "history", "alt", "ssid", "JBSWY3DP"])
      expect(text).not.toContain(absent);
  });
});

describe("linkContentOfText", () => {
  it("is one hidden field with the given label", () => {
    expect(linkContentOfText("Tür-Code", "Nachricht", "4711")).toEqual({
      version: 1,
      title: "Tür-Code",
      fields: [{ label: "Nachricht", value: "4711", secret: true }],
    });
  });
});

describe("encodeLinkContent and decodeLinkContent", () => {
  const content = linkContentOfEntry(wlan);

  it("round-trip through UTF-8 JSON", () => {
    expect(decodeLinkContent(encodeLinkContent(content))).toEqual({ ok: true, value: content });
    expect(new TextDecoder().decode(encodeLinkContent(content))).toBe(JSON.stringify(content));
  });

  it("refuses to encode content outside the schema", () => {
    expect(() => encodeLinkContent({ ...content, fields: [] })).toThrow();
  });

  it("answers anything but valid content of version 1 with damaged", () => {
    const damaged = { ok: false, error: "damaged" };
    const cases: unknown[] = [
      { ...content, version: 2 },
      { ...content, fields: [] },
      { ...content, fields: [{ label: "x", value: "", secret: true }] },
      { ...content, fields: [{ label: "x", value: "y" }] },
      { version: 1, fields: content.fields },
      null,
      "text",
    ];
    for (const value of cases)
      expect(decodeLinkContent(utf8(JSON.stringify(value)))).toEqual(damaged);
    expect(decodeLinkContent(utf8("{"))).toEqual(damaged);
    expect(decodeLinkContent(Uint8Array.of(0xff, 0xfe))).toEqual(damaged);
    // Invalid UTF-8 inside an otherwise valid string is damaged too, not quietly replaced by U+FFFD
    const valid = encodeLinkContent(linkContentOfText("X", "Nachricht", "4711"));
    expect(decodeLinkContent(valid).ok).toBe(true);
    expect(decodeLinkContent(valid.map((byte) => (byte === 0x58 ? 0xff : byte)))).toEqual(damaged);
    expect(decodeLinkContent(new Uint8Array())).toEqual(damaged);
  });

  it("holds titles, labels, values and the number of fields to their limits", () => {
    const at = (over: Partial<LinkContent>) =>
      decodeLinkContent(utf8(JSON.stringify({ ...content, ...over }))).ok;
    const field = (label: string, value: string) => ({ label, value, secret: false });
    expect([LINK_TITLE_MAX, LINK_LABEL_MAX, LINK_VALUE_MAX, LINK_FIELDS_MAX]).toEqual([
      200, 200, 20_000, 50,
    ]);
    expect(at({ title: "t".repeat(200) })).toBe(true);
    expect(at({ title: "t".repeat(201) })).toBe(false);
    expect(at({ fields: [field("l".repeat(200), "v")] })).toBe(true);
    expect(at({ fields: [field("l".repeat(201), "v")] })).toBe(false);
    expect(at({ fields: [field("l", "v".repeat(20_000))] })).toBe(true);
    expect(at({ fields: [field("l", "v".repeat(20_001))] })).toBe(false);
    expect(at({ fields: Array.from({ length: 50 }, () => field("l", "v")) })).toBe(true);
    expect(at({ fields: Array.from({ length: 51 }, () => field("l", "v")) })).toBe(false);
  });
});
