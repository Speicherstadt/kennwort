/**
 * CSV as the managers write it (RFC 4180 and what Excel, Chrome and KeePassXC make of it): comma
 * between cells, quotes around cells with commas, quotes or line breaks, a doubled quote inside;
 * CRLF, LF or a lone CR end a row. Lenient where exports are sloppy (text after a closing quote is
 * kept), strict only where data would be lost: a quote that never closes. One pass, no
 * backtracking, so no input can make it hang.
 */
import type { Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import { decodeText } from "./text.ts";
import type { ImportError } from "./types.ts";

type Rows = string[][];

/** Is a row nothing but one empty cell (a blank line)? */
const blank = (row: string[]) => row.length === 1 && row[0] === "";

/** The rows and their cells; blank lines are left out */
export const parseCsv = (text: string): Result<Rows, "bad-csv"> => {
  const rows: Rows = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (!blank(row)) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const char = text[i] as string;
    i++;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") endCell();
    // CRLF ends a row at CR; the LF then ends an empty one, which is left out like a blank line
    else if (char === "\n" || char === "\r") endRow();
    else cell += char;
  }
  if (quoted) return err("bad-csv");
  endRow();
  return ok(rows);
};

/** A row read by column name; a missing cell reads as empty */
export type Row = (column: string) => string;
export type Table = { columns: string[]; rows: Row[] };

/** Column names compare without case and surrounding spaces */
const key = (column: string) => column.trim().toLowerCase();

const rowOf = (columns: string[], cells: string[]): Row => {
  const values = new Map(columns.map((column, index) => [key(column), cells[index] ?? ""]));
  return (column) => values.get(key(column)) ?? "";
};

/** The file as rows under its first line, the header */
export const readTable = (input: string | Uint8Array): Result<Table, ImportError> => {
  const text = decodeText(input);
  if (!text.ok) return text;
  const rows = parseCsv(text.value);
  if (!rows.ok) return rows;
  const [columns = [], ...cells] = rows.value;
  return ok({ columns, rows: cells.map((row) => rowOf(columns, row)) });
};

/** Does the header have all these columns? */
export const hasColumns = (table: Table, required: readonly string[]): boolean => {
  const present = new Set(table.columns.map(key));
  return required.every((column) => present.has(key(column)));
};

/** The table, if its header has these columns */
export const readTableWith = (
  input: string | Uint8Array,
  required: readonly string[],
): Result<Table, ImportError> => {
  const table = readTable(input);
  if (!table.ok) return table;
  return hasColumns(table.value, required) ? table : err("wrong-format");
};

/** The rows of a file without a header (Keeper), each as its cells */
export const readRows = (input: string | Uint8Array): Result<Rows, ImportError> => {
  const text = decodeText(input);
  return text.ok ? parseCsv(text.value) : text;
};
