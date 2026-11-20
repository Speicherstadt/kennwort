import { describe, expect, it } from "vitest";
import { hasColumns, parseCsv, readRows, readTable, readTableWith } from "./csv.ts";

const rows = (text: string) => {
  const result = parseCsv(text);
  return result.ok ? result.value : result.error;
};

describe("CSV reader (K-502)", () => {
  it("splits cells at commas and rows at LF, CRLF and a lone CR", () => {
    expect(rows("a,b\nc,d\r\ne,f\rg,h")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ]);
  });

  it("keeps commas, line breaks and doubled quotes inside quotes", () => {
    expect(rows('"a,1","b\r\nc","sagt ""hallo"""\n')).toEqual([["a,1", "b\r\nc", 'sagt "hallo"']]);
  });

  it("keeps empty cells, also at the end of a row", () => {
    expect(rows(",x,\n,,")).toEqual([
      ["", "x", ""],
      ["", "", ""],
    ]);
  });

  it("leaves out blank lines but keeps a row of one quoted empty cell's neighbours", () => {
    expect(rows("\n\na\n\r\n\nb\n")).toEqual([["a"], ["b"]]);
    expect(rows("")).toEqual([]);
  });

  it("takes a quote inside an unquoted cell literally", () => {
    expect(rows('ab"c,d')).toEqual([['ab"c', "d"]]);
  });

  it("keeps text after a closing quote", () => {
    expect(rows('"ab"cd,e')).toEqual([["abcd", "e"]]);
  });

  it("refuses a quote that never closes", () => {
    expect(rows('a,"b\nc')).toBe("bad-csv");
    expect(rows('"a""')).toBe("bad-csv");
  });
});

describe("CSV tables (K-502)", () => {
  it("reads rows by column name without case or spaces, a missing cell as empty", () => {
    const table = readTable(" Name ,URL\nKasse,https://k.example\nNur");
    expect(table.ok).toBe(true);
    if (!table.ok) return;
    expect(table.value.columns).toEqual([" Name ", "URL"]);
    const [first, second] = table.value.rows;
    expect([first?.("name"), first?.("url"), first?.(" NAME"), first?.("fehlt")]).toEqual([
      "Kasse",
      "https://k.example",
      "Kasse",
      "",
    ]);
    expect(second?.("url")).toBe("");
  });

  it("folds column names to lower case, not upper case", () => {
    const table = readTable("Maß\n1");
    if (!table.ok) throw new Error("table");
    expect([table.value.rows[0]?.("MASS"), table.value.rows[0]?.("MAß")]).toEqual(["", "1"]);
  });

  it("reads bytes with a BOM and an empty file as a table without columns", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a\n1")]);
    const table = readTable(bytes);
    expect(table.ok && table.value.columns).toEqual(["a"]);
    const empty = readTable("");
    expect(empty.ok && [empty.value.columns, empty.value.rows]).toEqual([[], []]);
  });

  it("passes on text and CSV errors", () => {
    expect(readTable(new Uint8Array([0xff]))).toEqual({ ok: false, error: "not-text" });
    expect(readTable('"')).toEqual({ ok: false, error: "bad-csv" });
    expect(readTableWith('"', ["a"])).toEqual({ ok: false, error: "bad-csv" });
    expect(readRows(new Uint8Array([0xff]))).toEqual({ ok: false, error: "not-text" });
  });

  it("checks the header for the columns a format needs", () => {
    const table = readTable("A,b");
    if (!table.ok) throw new Error("table");
    expect(hasColumns(table.value, ["a", "B"])).toBe(true);
    expect(hasColumns(table.value, ["a", "c"])).toBe(false);
    expect(readTableWith("A,b", ["c"])).toEqual({ ok: false, error: "wrong-format" });
    expect(readTableWith("A,b", ["a"]).ok).toBe(true);
  });

  it("reads rows without a header as cells", () => {
    expect(readRows("a,b\nc")).toEqual({ ok: true, value: [["a", "b"], ["c"]] });
  });
});
