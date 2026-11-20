/**
 * Keeper's CSV export (Settings → Export → CSV), without a header: folder, title, login, password,
 * website, notes, shared folder, then own fields as name and value in turn; the one-time code is the
 * field `TFC:Keeper`. Folders and shared folders use `\` between levels and both become folders.
 * Rows with fewer than six cells are not records. Source: the structure of real exports as in
 * Bitwarden's keeper-csv test data and importer (bitwarden/clients, libs/importer).
 */
import { ok } from "../result.ts";
import { readRows } from "./csv.ts";
import { custom, type DraftField, login } from "./entry.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const TOTP = "TFC:Keeper";

/** The name and value pairs after the seventh cell */
const pairs = (cells: string[]): [string, string][] =>
  cells
    .slice(7)
    .flatMap((name, index, rest) =>
      index % 2 === 0 ? [[name, rest[index + 1] ?? ""] as const] : [],
    );

const folder = (path: string) => path.replaceAll("\\", "/");

const entryOf = (cells: string[]): ImportedEntry => {
  const cell = (index: number) => cells[index] ?? "";
  const own = pairs(cells);
  const fields: DraftField[] = own
    .filter(([name]) => name !== TOTP)
    .map(([name, value]) => custom(name, value));
  return login({
    title: cell(1),
    username: cell(2),
    password: cell(3),
    urls: [cell(4)],
    totp: own.find(([name]) => name === TOTP)?.[1],
    fields,
    notes: cell(5),
    folders: [folder(cell(0)), folder(cell(6))],
  });
};

export const parseKeeperCsv: Parser = (input) => {
  const rows = readRows(input);
  if (!rows.ok) return rows;
  return ok(rows.value.filter((cells) => cells.length >= 6).map(entryOf));
};
