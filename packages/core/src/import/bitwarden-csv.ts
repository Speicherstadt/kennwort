/**
 * Bitwarden's and Vaultwarden's CSV export: `folder,favorite,type,name,notes,fields,reprompt,
 * login_uri,login_username,login_password,login_totp`; an organisation's starts with `collections`
 * (several, separated by commas) instead of `folder,favorite`. Own fields are `name: value` lines,
 * several links one CSV line in `login_uri`; `type` is `login` or `note` (the CSV has no other
 * kinds). Source: bitwarden/clients, libs/importer/src/importers/bitwarden/bitwarden-csv-importer.ts.
 */
import { ok } from "../result.ts";
import { parseCsv, type Row, readTableWith } from "./csv.ts";
import { custom, imported, login } from "./entry.ts";
import type { ImportedEntry, Parser } from "./types.ts";

/** `name: value` lines; the last `: ` splits, as Bitwarden writes it */
const ownFields = (text: string) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.includes(": "))
    .map((line) => {
      const at = line.lastIndexOf(": ");
      return custom(line.slice(0, at), line.slice(at + 2));
    });

/** The links of `login_uri`, itself a line of CSV */
const urls = (cell: string) => {
  const rows = parseCsv(cell);
  return rows.ok ? rows.value.flat() : [cell];
};

const entryOf = (row: Row): ImportedEntry => {
  const base = {
    title: row("name"),
    notes: row("notes"),
    favorite: row("favorite") === "1",
    folders: [row("folder"), ...row("collections").split(",")],
  };
  if (row("type") === "note")
    return imported({ ...base, type: "note", fields: ownFields(row("fields")) });
  return login({
    ...base,
    username: row("login_username"),
    password: row("login_password"),
    urls: urls(row("login_uri")),
    totp: row("login_totp"),
    fields: ownFields(row("fields")),
  });
};

export const parseBitwardenCsv: Parser = (input) => {
  const table = readTableWith(input, ["type", "name", "notes", "fields", "login_uri"]);
  return table.ok ? ok(table.value.rows.map(entryOf)) : table;
};
