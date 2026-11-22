import { describe, expect, it } from "vitest";
import { compact, fixture } from "./test/helpers.ts";
import { parseTpmCsv } from "./tpm-csv.ts";

const CUSTOM_HEADERS = Array.from({ length: 10 }, (_, i) => `"Custom ${i + 1}"`).join(",");
const HEADER = `"Project name","Name","Access information","Username","E-mail","Password","Notes","Tags","Custom fields",${CUSTOM_HEADERS},"Expiry date (mm-dd-yyyy)"`;

/** One row of the export, the cells by place, the rest empty */
const row = (cells: Record<number, string>) =>
  Array.from({ length: 20 }, (_, i) => `"${(cells[i] ?? "").replaceAll('"', '""')}"`).join(",");

const parse = (...rows: string[]) => compact(parseTpmCsv([HEADER, ...rows].join("\n")));

describe("Team Password Manager CSV (K-502)", () => {
  it("reads the export with projects as folders, custom fields, tags and the expiry date", () => {
    expect(compact(parseTpmCsv(fixture("teampasswordmanager.csv")))).toEqual([
      {
        type: "login",
        title: "DATEV Unternehmen online",
        fields: [
          ["username", "Username", "anna.weber", "text"],
          ["password", "Password", "Kessel-Rohr-Ventil-26", "secret"],
          ["website", "Website", "https://www.datev.de/unternehmen-online", "url"],
          ["field-1", "Email", "anna@weber-haustechnik.example", "email"],
          ["field-2", "Mandantennummer", "4711", "secret"],
          ["field-3", "Beraternummer", "98765", "secret"],
          ["field-4", "Expiry date", "2027-12-31", "text"],
          ["note", "Notes", "Mandant 4711\nBerater: Steuerbüro Kranz", "note"],
        ],
        tags: ["Buchhaltung", "Steuern"],
        folders: ["Büro"],
      },
      {
        type: "login",
        title: "Heizungs-Fernwartung",
        fields: [
          ["username", "Username", "service", "text"],
          ["password", "Password", "F3rnW@rtung", "secret"],
          ["website", "Website", "fernwartung.heizung.example:8443", "url"],
          ["note", "Notes", 'Zugang für alle Monteure, "Notfall" zuerst', "note"],
        ],
        folders: ["Technik"],
      },
      {
        type: "login",
        title: "Alarmanlage Lager",
        fields: [
          ["field-1", "Access", "Bedienteil im Flur", "text"],
          ["field-2", "PIN Bedienteil", "0815-Ä", "secret"],
        ],
        tags: ["Sicherheit"],
        folders: ["Technik"],
      },
      {
        type: "note",
        title: "Gast-WLAN",
        fields: [["note", "Notes", "Steht auf dem Router im Büro.", "note"]],
        folders: ["Büro"],
      },
      {
        type: "login",
        title: "Großhandel-Portal",
        fields: [
          ["username", "Username", "max@weber-haustechnik.example", "text"],
          ["password", "Password", "Rohr🔥Zange-2026", "secret"],
          ["website", "Website", "https://shop.großhandel.example", "url"],
          ["field-1", "Expiry date", "2027-03-01", "text"],
        ],
        folders: ["Büro"],
      },
    ]);
  });

  it("names a custom field without a name by its number and trims the names", () => {
    expect(parse(row({ 1: "NAS", 8: " Seriennummer ,", 9: "SN-1", 10: "x", 18: "y" }))).toEqual([
      {
        type: "login",
        title: "NAS",
        fields: [
          ["field-1", "Seriennummer", "SN-1", "secret"],
          ["field-2", "Custom 2", "x", "secret"],
          ["field-3", "Custom 10", "y", "secret"],
        ],
      },
    ]);
  });

  it("keeps an expiry date it cannot read as written", () => {
    for (const date of ["31.12.2027", "x12-31-2027", "12-31-2027x"])
      expect(parse(row({ 1: "A", 19: date }))).toEqual([
        { type: "login", title: "A", fields: [["field-1", "Expiry date", date, "text"]] },
      ]);
  });

  it("takes access information with spaces around it as an address", () => {
    expect(parse(row({ 1: "A", 2: " https://a.example " }))).toEqual([
      { type: "login", title: "A", fields: [["website", "Website", "https://a.example", "url"]] },
    ]);
  });

  it("keeps the e-mail as its own field only beside a username", () => {
    expect(parse(row({ 1: "A", 3: "anna", 4: "a@b.example" }))).toEqual([
      {
        type: "login",
        title: "A",
        fields: [
          ["username", "Username", "anna", "text"],
          ["field-1", "Email", "a@b.example", "email"],
        ],
      },
    ]);
  });

  it("reads rows with fewer cells and leaves out rows of empty cells", () => {
    expect(parse('"Büro","Kurz"', row({}))).toEqual([
      { type: "login", title: "Kurz", fields: [], folders: ["Büro"] },
    ]);
  });

  it("needs the twenty columns of the export", () => {
    const short = HEADER.split(",").slice(0, 19).join(",");
    expect(parseTpmCsv(`${short}\n"a"`)).toEqual({ ok: false, error: "wrong-format" });
    expect(parseTpmCsv("")).toEqual({ ok: false, error: "wrong-format" });
    expect(parseTpmCsv('"a')).toEqual({ ok: false, error: "bad-csv" });
    expect(parseTpmCsv(new Uint8Array([0xff]))).toEqual({ ok: false, error: "not-text" });
  });
});
