import { describe, expect, it } from "vitest";
import { parseKeeperCsv } from "./keeper-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Keeper CSV (K-502)", () => {
  it("reads a real export: no header, own fields in pairs, the one-time code, shared folders", () => {
    expect(compact(parseKeeperCsv(fixture("keeper.csv")))).toEqual([
      {
        type: "login",
        title: "Telekom Kundencenter",
        fields: [
          ["username", "Username", "jonas@weber-haustechnik.example", "text"],
          ["password", "Password", "T3lek0m!", "secret"],
          ["website", "Website", "https://kundencenter.telekom.example", "url"],
          ["note", "Notes", "Vertrag 2026, Glasfaser", "note"],
        ],
        folders: ["Büro"],
      },
      {
        type: "login",
        title: "Werkzeugverleih",
        fields: [
          ["username", "Username", "max", "text"],
          ["password", "Password", "W3rkz€ug", "secret"],
          ["website", "Website", "https://verleih.example", "url"],
          ["totp", "One-time code", "otpauth://totp/Verleih:max?secret=JBSWY3DPEHPK3PXP", "totp"],
          ["field-1", "Kundennummer", "K-4471", "text"],
        ],
        folders: ["Technik/Werkzeug", "Shared Technik"],
      },
    ]);
  });
  it("keeps a last field name without a value out", () => {
    expect(compact(parseKeeperCsv('"","T","u","p","","","","Allein"'))).toEqual([
      {
        type: "login",
        title: "T",
        fields: [
          ["username", "Username", "u", "text"],
          ["password", "Password", "p", "secret"],
        ],
      },
    ]);
  });

  it("reads a row of exactly six cells, without a shared folder", () => {
    expect(compact(parseKeeperCsv('"Büro","T","u","","",""'))).toEqual([
      {
        type: "login",
        title: "T",
        fields: [["username", "Username", "u", "text"]],
        folders: ["Büro"],
      },
    ]);
  });

  it("passes on what the CSV reader reports", () => {
    expect(parseKeeperCsv('"offen')).toEqual({ ok: false, error: "bad-csv" });
    expect(parseKeeperCsv(new Uint8Array([0xc3]))).toEqual({ ok: false, error: "not-text" });
  });
});
