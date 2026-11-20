import { setLocale } from "@kennwort/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { shown } from "./entries/entries.ts";
import { folded, matchesSearch } from "./search.ts";

// K-306 part 5: the search over everything but the secrets
beforeEach(() => setLocale("de", { reload: false }));

const entry = shown({
  idText: "e1",
  vaultIdText: "v",
  role: "edit",
  version: 1,
  content: {
    type: "wifi",
    title: "WLAN Büro",
    fields: [
      { id: "ssid", name: "", value: "Weber-Buero", kind: "text" },
      { id: "password", name: "", value: "Heizung-Wasser-42", kind: "secret" },
      { id: "c-mail", name: "", value: "it@weber-haustechnik.test", kind: "email" },
      { id: "c-url", name: "", value: "https://router.lan", kind: "url" },
      { id: "c-note", name: "", value: "Schlüssel beim Nachbarn", kind: "note" },
      { id: "c-totp", name: "", value: "JBSWY3DPEHPK3PXP", kind: "totp" },
      { id: "c-other", name: "", value: "geheimnis", kind: "custom" as never },
      { id: "c-straße", name: "", value: "Hauptstraße 1", kind: "text" },
    ],
    tags: ["Werkstatt"],
    favorite: false,
    history: [{ fieldId: "password", value: "alt-Passwort", replacedAt: 1 }],
  },
});

describe("search over everything", () => {
  it("folds case, accents and ß", () => {
    expect(folded("Büro STRAẞE Crème")).toBe("buro strasse creme");
  });

  it("finds an entry by title, type, tag and every field that is not secret", () => {
    for (const text of [
      "buro",
      "BÜRO",
      " wlan ",
      "werkstatt",
      "weber-buero",
      "haustechnik.test",
      "router.lan",
      "nachbarn",
      "Hauptstrasse",
      "",
    ])
      expect(matchesSearch(entry, text), text).toBe(true);
  });

  it("never finds an entry by a secret, a TOTP key, an earlier password or an unknown kind", () => {
    for (const text of ["Heizung", "JBSWY3DP", "alt-Passwort", "geheimnis", "Kunden"])
      expect(matchesSearch(entry, text), text).toBe(false);
  });
});
