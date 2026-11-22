/**
 * The CSV export (K-504) in Bitwarden's columns, which most managers read (Bitwarden, Vaultwarden,
 * Proton Pass, KeePassXC's CSV import with a mapping, Kennwort itself):
 * `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,
 * login_totp`. Source: bitwarden/clients, libs/importer/src/importers/bitwarden/
 * bitwarden-csv-importer.ts and the export it reads. Plain text: every secret is in the file.
 *
 * The folder is the vault's name. Bitwarden's CSV knows logins and notes only, so every other
 * type is a login whose fields are extra fields; those are `name: value` lines, and one that runs
 * over several lines (a private key) goes into the notes instead, where a line break is no
 * separator (so does one whose value holds `: `). Several links are one CSV line in `login_uri`. Values are written as they are: a
 * leading `=` stays, so a password survives the round trip; open the file in a spreadsheet only
 * with care.
 */
import { type FlatEntry, flatEntry } from "./flat.ts";
import type { ExportVault } from "./payload.ts";

export const BITWARDEN_COLUMNS = [
  "folder",
  "favorite",
  "type",
  "name",
  "notes",
  "fields",
  "reprompt",
  "login_uri",
  "login_username",
  "login_password",
  "login_totp",
] as const;

/** A cell as RFC 4180 writes it: quoted when it holds a comma, quote, line break or edge space */
export const csvCell = (value: string): string =>
  /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const csvLine = (cells: readonly string[]) => cells.map(csvCell).join(",");

/**
 * An extra field the `name: value` lines cannot hold: one over several lines, or one whose value
 * holds `: ` itself, as Bitwarden splits at the last one
 */
const unfit = (value: string) => /[\r\n]|: /.test(value);

/** The notes, then each extra field the lines cannot hold, as its name and value */
const notesOf = (entry: FlatEntry) =>
  [entry.notes, ...entry.fields.filter((f) => unfit(f.value)).map((f) => `${f.name}:\n${f.value}`)]
    .filter((part) => part !== "")
    .join("\n\n");

const fieldsOf = (entry: FlatEntry) =>
  entry.fields
    .filter((f) => !unfit(f.value))
    .map((f) => `${f.name}: ${f.value}`)
    .join("\n");

/** A note in Bitwarden's sense: of type note and with nothing for the login columns */
const isNote = (entry: FlatEntry) =>
  entry.type === "note" &&
  [entry.username, entry.password, entry.totp, ...entry.urls].every((value) => value === "");

const rowOf = (folder: string, entry: FlatEntry) => [
  folder,
  entry.favorite ? "1" : "",
  isNote(entry) ? "note" : "login",
  entry.title,
  notesOf(entry),
  fieldsOf(entry),
  "0",
  // Empty for a note, by isNote
  csvLine(entry.urls),
  entry.username,
  entry.password,
  entry.totp,
];

/** The vaults' entries as Bitwarden's CSV, one line per entry, CRLF as RFC 4180 has it */
export const writeBitwardenCsv = (vaults: readonly ExportVault[]): string =>
  [
    BITWARDEN_COLUMNS,
    ...vaults.flatMap((vault) => vault.entries.map((e) => rowOf(vault.name, flatEntry(e)))),
  ]
    .map(csvLine)
    .join("\r\n")
    .concat("\r\n");
