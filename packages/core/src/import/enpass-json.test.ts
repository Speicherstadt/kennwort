import { describe, expect, it } from "vitest";
import { parseEnpassJson } from "./enpass-json.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Enpass JSON (K-502)", () => {
  it("reads a real export: folders with parents, sections, deleted fields, the trash", () => {
    expect(compact(parseEnpassJson(fixture("enpass.json")))).toEqual([
      {
        type: "login",
        title: "Heizungsportal Kunde Meyer",
        fields: [
          ["username", "Username", "service@weber-haustechnik.example", "text"],
          ["field-1", "E-mail", "service@weber-haustechnik.example", "email"],
          ["password", "Password", "Me7er-Heizung", "secret"],
          ["website", "Website", "https://heizung.kunde.example", "url"],
          ["totp", "One-time code", "JBSWY3DPEHPK3PXP", "totp"],
          ["field-2", "Anlagennummer", "WP-2291", "text"],
          ["field-3", "Wartungscode", "8812", "secret"],
          ["note", "Notes", "Anlage im Keller\nZugang über Garage", "note"],
        ],
        favorite: true,
        folders: ["Weber Haustechnik/Kunden"],
      },
      {
        type: "card",
        title: "Tankkarte",
        fields: [
          ["holder", "Cardholder", "Sandra Becker", "text"],
          ["field-1", "Type", "Visa", "text"],
          ["number", "Card number", "4000056655665556", "secret"],
          ["cvc", "CVC", "321", "secret"],
          ["pin", "PIN", "9876", "secret"],
          ["expiry", "Expiry", "09/27", "text"],
        ],
        folders: ["Schleife B/Schleife A"],
      },
      {
        type: "note",
        title: "Notfallnummern",
        fields: [["note", "Notes", "Heizungsnotdienst: 0421 999", "note"]],
      },
      {
        type: "identity",
        title: "Anna Schmidt",
        fields: [
          ["field-1", "Name", "Anna Schmidt", "text"],
          ["field-2", "E-mail", "anna@weber-haustechnik.example", "email"],
        ],
      },
    ]);
  });
  it("leaves out section headings even when they carry a value", () => {
    const json = JSON.stringify({
      items: [{ title: "S", fields: [{ label: "Kopf", type: "section", value: "x" }] }],
    });
    expect(compact(parseEnpassJson(json))).toEqual([{ type: "login", title: "S", fields: [] }]);
  });

  it("refuses JSON of another shape", () => {
    expect(parseEnpassJson('{"folders":[]}')).toEqual({ ok: false, error: "wrong-format" });
  });
});
