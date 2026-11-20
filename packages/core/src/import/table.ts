/**
 * Logins from a CSV whose columns are known by name: the browsers, KeePassXC, Passbolt, 1Password
 * and any table the person maps column by column in the import flow (K-501). A format names its
 * columns and how it writes folders, tags and favorites; the rest is the same for all.
 */
import { err, ok } from "../result.ts";
import { type Row, readTable, readTableWith } from "./csv.ts";
import { type DraftField, login } from "./entry.ts";
import type { ImportedEntry, ImportResult, Parser } from "./types.ts";

/** Which column holds what; a part left out stays empty */
export type Columns = {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  totp?: string;
  notes?: string;
  folder?: string;
  tags?: string;
  favorite?: string;
};

export type TableFormat = {
  columns: Columns;
  /** Columns the header must have to be this format */
  required: readonly string[];
  /** The folder path as Kennwort keeps it; by default as written */
  folder?: (value: string) => string;
  tags?: (value: string) => string[];
  favorite?: (value: string) => boolean;
  /** Further fields of a row (a format's own columns) */
  fields?: (row: Row) => DraftField[];
  /** Rows that are not entries (a browser's own sync key) */
  skip?: (row: Row) => boolean;
};

const read = (row: Row, column: string | undefined) => (column === undefined ? "" : row(column));

const rowEntry = (format: TableFormat, row: Row): ImportedEntry => {
  const { columns } = format;
  const value = (part: keyof Columns) => read(row, columns[part]);
  return login({
    title: value("title"),
    username: value("username"),
    password: value("password"),
    urls: [value("url")],
    totp: value("totp"),
    fields: format.fields?.(row),
    notes: value("notes"),
    folders: [(format.folder ?? String)(value("folder"))],
    tags: format.tags?.(value("tags")),
    favorite: format.favorite?.(value("favorite")),
  });
};

/** An entry with neither title nor fields came from a row of empty cells */
const hasContent = (entry: ImportedEntry) =>
  entry.content.title !== "" || entry.content.fields.length > 0;

const entriesOf = (format: TableFormat, rows: Row[]): ImportedEntry[] =>
  rows
    .filter((row) => !format.skip?.(row))
    .map((row) => rowEntry(format, row))
    .filter(hasContent);

/** A parser for this format */
export const tableParser =
  (format: TableFormat): Parser =>
  (input) => {
    const table = readTableWith(input, format.required);
    return table.ok ? ok(entriesOf(format, table.value.rows)) : table;
  };

/** Splits a list cell ("a, b") into its items */
export const splitList =
  (separator: string) =>
  (value: string): string[] =>
    value.split(separator);

/** The column names of a CSV, for mapping them by hand in the import flow */
export const csvColumns = (input: string | Uint8Array) => {
  const table = readTable(input);
  return table.ok ? ok(table.value.columns) : table;
};

/**
 * Any table: the person says which column holds what (K-501). Every mapped column must exist;
 * a mapping without a single column is no mapping.
 */
export const parseTableCsv =
  (columns: Columns): Parser =>
  (input): ImportResult => {
    const required = Object.values(columns);
    if (required.length === 0) return err("wrong-format");
    return tableParser({ columns, required, tags: splitList(",") })(input);
  };
