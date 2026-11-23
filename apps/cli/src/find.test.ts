import type { ShownEntry, ShownField } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import { findEntry, pickField, readField, searchEntries } from "./find.ts";

const field = (id: string, kind: ShownField["kind"], value: string): ShownField => ({
  id,
  label: id,
  kind,
  value,
});

const entry = (id: string, title: string, fields: ShownField[]): ShownEntry => ({
  id,
  type: "login",
  title,
  subtitle: "",
  fields,
  username: fields.find((f) => f.id === "username")?.value ?? "",
  password: fields.find((f) => f.id === "password")?.value ?? "",
  website: fields.find((f) => f.id === "website")?.value ?? "",
  vault: "vault-1",
  favorite: false,
  tags: ["Heizung"],
  history: [],
  weak: false,
  reused: 0,
  changedAt: 0,
  changedBy: "",
  access: [],
});

const datev = entry("id-datev", "DATEV Unternehmen online", [
  field("username", "text", "anna@weber-haustechnik.de"),
  field("password", "secret", "Kupfer-Rohr-42"),
  field("website", "url", "https://www.datev.de"),
  field("totp", "totp", "otpauth://totp/DATEV?secret=JBSWY3DPEHPK3PXP"),
  field("notiz", "note", "Steuerbüro Kaiser"),
]);
const wlan = entry("id-wlan", "WLAN Büro", [
  field("ssid", "text", "Weber-Gast"),
  field("password", "secret", "Heizkessel-7"),
]);
const lexware = entry("id-lex", "Lexware", [field("username", "text", "jonas")]);
const entries = [datev, wlan, lexware];

describe("the search of the CLI", () => {
  it("finds by title, without regard to case or accents", () => {
    expect(searchEntries(entries, "buro").map((e) => e.id)).toEqual(["id-wlan"]);
    expect(searchEntries(entries, "DATEV").map((e) => e.id)).toEqual(["id-datev"]);
  });

  it("finds by username and by address", () => {
    expect(searchEntries(entries, "anna@").map((e) => e.id)).toEqual(["id-datev"]);
    expect(searchEntries(entries, "datev.de").map((e) => e.id)).toEqual(["id-datev"]);
  });

  it("never looks into secrets, one-time code keys, notes or tags", () => {
    for (const query of ["Kupfer", "Heizkessel", "JBSWY3DP", "Steuerbüro", "Heizung"])
      expect(searchEntries(entries, query)).toEqual([]);
  });

  it("lists every entry, sorted by title, for an empty query", () => {
    expect(searchEntries(entries, "  ").map((e) => e.title)).toEqual([
      "DATEV Unternehmen online",
      "Lexware",
      "WLAN Büro",
    ]);
  });
});

describe("which entry get means", () => {
  it("takes the ID", () => {
    expect(findEntry(entries, "id-wlan")).toEqual({ ok: true, value: wlan });
  });

  it("takes the whole title, without regard to case or accents", () => {
    expect(findEntry(entries, "wlan buro")).toEqual({ ok: true, value: wlan });
  });

  it("does not guess from a part of the title", () => {
    expect(findEntry(entries, "WLAN")).toEqual({ ok: false, error: "not-found" });
  });

  it("names the candidates when two entries share the title", () => {
    const twin = { ...wlan, id: "id-wlan-2" };
    expect(findEntry([...entries, twin], "WLAN Büro")).toEqual({
      ok: false,
      error: "ambiguous",
      candidates: [wlan, twin],
    });
  });
});

describe("which field get prints", () => {
  it("is the password without --field", () => {
    expect(pickField(datev, undefined)).toEqual({ ok: true, value: datev.fields[1] });
  });

  it("is the first secret field of an entry without a password", () => {
    const card = entry("id-card", "Firmenkarte", [
      field("holder", "text", "Jonas Weber"),
      field("number", "secret", "4111"),
    ]);
    expect(pickField(card, undefined)).toEqual({ ok: true, value: card.fields[1] });
  });

  it("is the field named by ID or label", () => {
    expect(pickField(datev, "username")).toEqual({ ok: true, value: datev.fields[0] });
    expect(
      pickField(
        { ...datev, fields: [{ ...field("x", "text", "1"), label: "Kundennummer" }] },
        "kundennummer",
      ),
    ).toEqual({ ok: true, value: { ...field("x", "text", "1"), label: "Kundennummer" } });
  });

  it("names the fields there are when it has none such, never their values", () => {
    const picked = pickField(lexware, "password");
    expect(picked).toEqual({ ok: false, error: "no-field", fields: ["username"] });
    expect(JSON.stringify(pickField(datev, "pin"))).not.toContain("Kupfer");
  });

  it("gives the current one-time code for a TOTP field, never its key", () => {
    const read = readField(field("totp", "totp", "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP"), 0);
    expect(read).toEqual({ ok: true, value: "282760" });
  });

  it("refuses an empty field and a TOTP key it cannot read", () => {
    expect(readField(field("password", "secret", ""), 0)).toEqual({
      ok: false,
      error: "empty-field",
    });
    expect(readField(field("totp", "totp", "otpauth://hotp/x"), 0)).toEqual({
      ok: false,
      error: "invalid-totp",
    });
  });
});
