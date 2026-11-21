import { describe, expect, it } from "vitest";
import { parseBitwardenCsv } from "./bitwarden-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Bitwarden CSV (K-502)", () => {
  it("reads a personal export: folders, favorites, notes, own fields, two links", () => {
    expect(compact(parseBitwardenCsv(fixture("bitwarden.csv")))).toEqual([
      {
        type: "login",
        title: "Online-Banking Sparkasse",
        fields: [
          ["username", "Username", "jonas.weber", "text"],
          ["password", "Password", "Sp@rkasse-2026!", "secret"],
          ["website", "Website", "https://banking.sparkasse.example", "url"],
          ["website-2", "Website", "https://app.sparkasse.example", "url"],
          ["totp", "One-time code", "JBSWY3DPEHPK3PXP", "totp"],
          ["field-1", "Kundennummer", "7788-1", "text"],
          ["field-2", "PIN-Hinweis", "steht im Safe", "text"],
          ["note", "Notes", "TAN per App\nKontakt: Filiale Mitte", "note"],
        ],
        favorite: true,
        folders: ["Büro"],
      },
      {
        type: "note",
        title: "Alarmanlage Lager",
        fields: [["note", "Notes", "Code 2580, Ändern nach Personalwechsel", "note"]],
      },
      {
        type: "login",
        title: "Wärmepumpen-Portal",
        fields: [
          ["username", "Username", "max@weber-haustechnik.example", "text"],
          ["password", "Password", "W@ermepumpe1", "secret"],
          ["website", "Website", "https://wp-portal.example", "url"],
        ],
        folders: ["Technik"],
      },
    ]);
  });
  it("reads an organisation's export with collections", () => {
    expect(compact(parseBitwardenCsv(fixture("bitwarden-org.csv")))).toEqual([
      {
        type: "login",
        title: "Hersteller-Schulungsportal",
        fields: [
          ["username", "Username", "team@weber-haustechnik.example", "text"],
          ["password", "Password", "Schulung#2026", "secret"],
          ["website", "Website", "https://schulung.hersteller.example", "url"],
        ],
        folders: ["Alle Mitarbeiter", "Technik"],
      },
      {
        type: "login",
        title: "DATEV Unternehmen online",
        fields: [
          ["username", "Username", "anna@weber-haustechnik.example", "text"],
          ["password", "Password", "D@tev-Anna", "secret"],
          ["website", "Website", "https://duo.datev.example", "url"],
          ["field-1", "Beraternummer", "123456", "text"],
          ["note", "Notes", "Nur Anna und Jonas", "note"],
        ],
        folders: ["Buchhaltung"],
      },
    ]);
  });
  it("reads own fields split at the last colon and skips lines without one", () => {
    const csv = 'type,name,notes,fields,login_uri\nnote,N,,"Zeit: 10: 30\nohne Trenner",';
    expect(compact(parseBitwardenCsv(csv))).toEqual([
      { type: "note", title: "N", fields: [["field-1", "Zeit: 10", "30", "text"]] },
    ]);
  });

  it("keeps a link cell that is not valid CSV as one link", () => {
    const csv = 'type,name,notes,fields,login_uri\nlogin,L,,,"""https://a.example';
    expect(compact(parseBitwardenCsv(csv))).toEqual("bad-csv");
    const broken = 'type,name,notes,fields,login_uri\nlogin,L,,,"""https://a.example"';
    expect(compact(parseBitwardenCsv(broken))).toEqual([
      { type: "login", title: "L", fields: [["website", "Website", '"https://a.example', "url"]] },
    ]);
  });

  it("refuses a CSV with other columns", () => {
    expect(parseBitwardenCsv("name,notes\na,b")).toEqual({ ok: false, error: "wrong-format" });
  });
});
