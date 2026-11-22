import { describe, expect, it } from "vitest";
import { parseBitwardenCsv } from "../import/bitwarden-csv.ts";
import { parseCsv } from "../import/csv.ts";
import { BITWARDEN_COLUMNS, csvCell, writeBitwardenCsv } from "./csv.ts";
import { BUERO, TECHNIK, WEBER } from "./test/weber.ts";

const rowsOf = (csv: string) => {
  const rows = parseCsv(csv);
  if (!rows.ok) throw new Error(rows.error);
  return rows.value;
};

describe("csvCell", () => {
  it("quotes a comma, a quote, a line break and a space at either end, and nothing else", () => {
    expect(csvCell("Sp@rkasse-2026!")).toBe("Sp@rkasse-2026!");
    expect(csvCell("=SUMME(A1)")).toBe("=SUMME(A1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('Filiale "Mitte"')).toBe('"Filiale ""Mitte"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(csvCell(" a")).toBe('" a"');
    expect(csvCell("a ")).toBe('"a "');
    expect(csvCell("a b")).toBe("a b");
    expect(csvCell("")).toBe("");
  });
});

describe("writeBitwardenCsv", () => {
  const csv = writeBitwardenCsv(WEBER);

  it("writes Bitwarden's header and one row per entry, CRLF after each line", () => {
    expect(BITWARDEN_COLUMNS.join(",")).toBe(
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
    );
    expect(csv.startsWith(`${BITWARDEN_COLUMNS.join(",")}\r\n`)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(rowsOf(csv)).toHaveLength(5);
    expect(writeBitwardenCsv([])).toBe(`${BITWARDEN_COLUMNS.join(",")}\r\n`);
  });

  it("writes a login with its folder, favorite, links, own fields and code", () => {
    expect(rowsOf(csv)[1]).toEqual([
      "Büro",
      "1",
      "login",
      "Online-Banking Sparkasse",
      'TAN per App\nKontakt: Filiale "Mitte"',
      "Kundennummer: 7788-1\nPIN: 4711",
      "0",
      "https://banking.sparkasse.example,https://app.sparkasse.example",
      "jonas.weber",
      "Sp@rkasse-2026!",
      "otpauth://totp/Sparkasse:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Sparkasse",
    ]);
  });

  it("writes a note as a note and other types as logins, unfit fields in the notes", () => {
    const rows = rowsOf(csv);
    expect(rows[2]).toEqual([
      "Büro",
      "",
      "note",
      "Alarmanlage Lager",
      "Code 2580, Ändern nach Personalwechsel",
      "",
      "0",
      "",
      "",
      "",
      "",
    ]);
    expect(rows[3]?.slice(0, 7)).toEqual([
      "Technik",
      "",
      "login",
      "Werkstatt-WLAN",
      "",
      "SSID: Weber-Werkstatt\nSicherheit: WPA3",
      "0",
    ]);
    expect(rows[3]?.[9]).toBe("Kupfer & <Rohr> 18");
    // A key over several lines and a value with ": " cannot be a field line
    expect(rows[4]?.[4]).toBe(
      "Privater Schlüssel:\n-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----\n\nPassphrase:\nWärme: Pumpe",
    );
    expect(rows[4]?.[5]).toBe("");
  });

  it("writes a note with login values as a login, so nothing is lost", () => {
    const note = {
      ...BUERO.entries[1],
      fields: [{ id: "password", name: "Passwort", value: "geheim", kind: "secret" as const }],
    } as (typeof BUERO.entries)[0];
    for (const field of [
      { id: "username", value: "u" },
      { id: "password", value: "p" },
      { id: "totp", value: "otpauth://x" },
      { id: "website", value: "https://x" },
    ]) {
      const row = rowsOf(
        writeBitwardenCsv([
          { name: "", entries: [{ ...note, fields: [{ ...field, name: "x", kind: "text" }] }] },
        ]),
      )[1];
      expect(row?.[2]).toBe("login");
    }
  });

  it("writes a login without login values as a login still, as only a note is a note", () => {
    const bare = { ...BUERO.entries[1], type: "login" as const } as (typeof BUERO.entries)[0];
    expect(rowsOf(writeBitwardenCsv([{ name: "", entries: [bare] }]))[1]?.[2]).toBe("login");
  });

  it("quotes a link holding a comma inside the links' own CSV line", () => {
    const entry = {
      ...BUERO.entries[0],
      fields: [
        { id: "website", name: "W", value: "https://a.test/?q=1,2", kind: "url" as const },
        { id: "website-2", name: "W", value: "https://b.test", kind: "url" as const },
      ],
    } as (typeof BUERO.entries)[0];
    const row = rowsOf(writeBitwardenCsv([{ name: "x", entries: [entry] }]))[1];
    expect(row?.[7]).toBe('"https://a.test/?q=1,2",https://b.test');
  });
});

// Round trip: what Kennwort writes, Kennwort's Bitwarden reader reads back
describe("CSV round trip", () => {
  it("brings back title, login columns, links, own fields, notes, folder and favorite", () => {
    const read = parseBitwardenCsv(writeBitwardenCsv(WEBER));
    if (!read.ok) throw new Error(read.error);
    const [banking, alarm, wifi, ssh] = read.value;
    expect(banking?.folders).toEqual(["Büro"]);
    expect(banking?.content).toMatchObject({
      type: "login",
      title: "Online-Banking Sparkasse",
      favorite: true,
    });
    const values = (fields: { name: string; value: string }[] = []) =>
      fields.map((f) => [f.name, f.value]);
    expect(values(banking?.content.fields)).toEqual([
      ["Username", "jonas.weber"],
      ["Password", "Sp@rkasse-2026!"],
      ["Website", "https://banking.sparkasse.example"],
      ["Website", "https://app.sparkasse.example"],
      ["One-time code", "otpauth://totp/Sparkasse:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Sparkasse"],
      ["Kundennummer", "7788-1"],
      ["PIN", "4711"],
      ["Notes", 'TAN per App\nKontakt: Filiale "Mitte"'],
    ]);
    expect(alarm?.content).toMatchObject({ type: "note", title: "Alarmanlage Lager" });
    expect(alarm?.folders).toEqual(["Büro"]);
    expect(values(wifi?.content.fields)).toContainEqual(["Password", "Kupfer & <Rohr> 18"]);
    expect(values(wifi?.content.fields)).toContainEqual(["SSID", "Weber-Werkstatt"]);
    expect(ssh?.folders).toEqual(["Technik"]);
    expect(values(ssh?.content.fields).at(-1)?.[1]).toContain("Wärme: Pumpe");
    expect(TECHNIK.entries).toHaveLength(2);
  });
});
