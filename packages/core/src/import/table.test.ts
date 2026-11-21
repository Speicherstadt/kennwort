import { describe, expect, it } from "vitest";
import { csvColumns, parseTableCsv, splitList, tableParser } from "./table.ts";
import { compact } from "./test/helpers.ts";

describe("any table with a column mapping (K-502)", () => {
  const csv =
    'Bezeichnung;x,Benutzer,Kennwort,Adresse,Ordner,Schlagworte\nKasse,anna,K@sse,https://k.example,Büro,"a, b"';

  it("lists the columns of a CSV for the mapping", () => {
    expect(csvColumns(csv)).toEqual({
      ok: true,
      value: ["Bezeichnung;x", "Benutzer", "Kennwort", "Adresse", "Ordner", "Schlagworte"],
    });
    expect(csvColumns('"')).toEqual({ ok: false, error: "bad-csv" });
  });

  it("reads the mapped columns", () => {
    const parse = parseTableCsv({
      title: "Bezeichnung;x",
      username: "Benutzer",
      password: "Kennwort",
      url: "Adresse",
      folder: "Ordner",
      tags: "Schlagworte",
    });
    expect(compact(parse(csv))).toEqual([
      {
        type: "login",
        title: "Kasse",
        fields: [
          ["username", "Username", "anna", "text"],
          ["password", "Password", "K@sse", "secret"],
          ["website", "Website", "https://k.example", "url"],
        ],
        tags: ["a", "b"],
        folders: ["Büro"],
      },
    ]);
  });

  it("refuses a mapping without columns or with a column the file lacks", () => {
    expect(parseTableCsv({})(csv)).toEqual({ ok: false, error: "wrong-format" });
    expect(parseTableCsv({ title: "Fehlt" })(csv)).toEqual({ ok: false, error: "wrong-format" });
  });

  it("leaves out rows of empty cells and rows a format skips", () => {
    const parse = tableParser({
      columns: { title: "t", notes: "n" },
      required: ["t"],
      skip: (row) => row("t") === "weg",
    });
    expect(compact(parse("t,n\n,\nweg,x\n,nur Notiz\nNur Titel,"))).toEqual([
      { type: "note", title: "", fields: [["note", "Notes", "nur Notiz", "note"]] },
      { type: "login", title: "Nur Titel", fields: [] },
    ]);
  });

  it("splits list cells", () => {
    expect(splitList(";")("a;b")).toEqual(["a", "b"]);
  });
});
