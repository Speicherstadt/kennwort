/**
 * LastPass's CSV export from the web vault: `url,username,password,totp,extra,name,grouping,fav`.
 * Secure notes have the URL `http://sn`; a note of a kind keeps its fields in `extra` as
 * `NoteType:Credit Card` and then `Label:value` lines (the first, `Language`, is left out), its own
 * notes under `Notes:` to the end.
 * Cards and addresses become cards and identities, every other kind a note with its fields. The
 * grouping, with `\` between levels, is the folder (shared folders included); `(none)` is none.
 * Source: the structure of real exports as in Bitwarden's lastpass-csv test data and importer
 * (bitwarden/clients, libs/importer).
 */
import { ok } from "../result.ts";
import { type Row, readTableWith } from "./csv.ts";
import {
  custom,
  type DraftField,
  expiry,
  imported,
  joinFilled,
  joinLines,
  known,
  login,
} from "./entry.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const SECURE_NOTE = "http://sn";
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
/** Labels of a note's fields that hold secrets */
const SECRET_LABELS = new Set(["Password", "Passphrase", "Private Key", "Pin", "PIN", "Number"]);

type NoteFields = { kind: string; values: Map<string, string>; notes: string };

/** `NoteType:…`, then `Label:value` lines, then `Notes:` with the rest */
const noteFields = (extra: string): NoteFields => {
  const [first, ...lines] = extra.split(/\r?\n/);
  const notesAt = lines.findIndex((line) => line.startsWith("Notes:"));
  const labelled = notesAt < 0 ? lines : lines.slice(0, notesAt);
  const values = new Map(
    labelled
      .filter((line) => line.indexOf(":") > 0 && !line.startsWith("Language:"))
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1)]),
  );
  return {
    kind: `${first}`.slice("NoteType:".length),
    values,
    notes: notesAt < 0 ? "" : lines.slice(notesAt).join("\n").slice("Notes:".length),
  };
};

/** `June,2020` as 06/2020 */
const lastPassExpiry = (value: string) => {
  const [month, year] = [...value.split(","), ""];
  const number = MONTHS.indexOf(`${month}`.toLowerCase()) + 1;
  return expiry(number === 0 ? "" : String(number), `${year}`);
};

const creditCard = (note: NoteFields, base: Base) => {
  const value = (label: string) => note.values.get(label) ?? "";
  return imported({
    ...base,
    type: "card",
    fields: [
      known("holder", value("Name on Card")),
      known("number", value("Number")),
      known("expiry", lastPassExpiry(value("Expiration Date"))),
      known("cvc", value("Security Code")),
    ],
    notes: note.notes,
  });
};

const address = (note: NoteFields, base: Base) => {
  const value = (label: string) => note.values.get(label) ?? "";
  const name = [value("Title"), value("First Name"), value("Middle Name"), value("Last Name")];
  return imported({
    ...base,
    type: "identity",
    fields: [
      known("name", joinFilled(" ", name)),
      known("email", value("Email Address")),
      known("phone", value("Phone")),
      known(
        "address",
        joinLines(
          value("Company"),
          value("Address 1"),
          value("Address 2"),
          value("Address 3"),
          `${value("Zip / Postal Code")} ${value("City / Town")}`,
          value("State"),
          value("Country"),
        ),
      ),
      custom("Username", value("Username")),
    ],
    notes: note.notes,
  });
};

const otherNote = (note: NoteFields, base: Base) => {
  const fields: DraftField[] = [...note.values].map(([label, value]) =>
    custom(label, value, SECRET_LABELS.has(label) ? "secret" : "text"),
  );
  return imported({ ...base, type: "note", fields, notes: note.notes });
};

type Base = { title: string; favorite: boolean; folders: string[] };

const secureNote = (row: Row, base: Base): ImportedEntry => {
  const extra = row("extra");
  if (!extra.startsWith("NoteType:"))
    return imported({ ...base, type: "note", fields: [], notes: extra });
  const note = noteFields(extra);
  if (note.kind === "Credit Card") return creditCard(note, base);
  if (note.kind === "Address") return address(note, base);
  return otherNote(note, base);
};

const baseOf = (row: Row): Base => {
  const grouping = row("grouping").replaceAll("\\", "/");
  return {
    title: row("name"),
    favorite: row("fav") === "1",
    folders: grouping === "(none)" ? [] : [grouping],
  };
};

const entryOf = (row: Row): ImportedEntry => {
  const base = baseOf(row);
  if (row("url") === SECURE_NOTE) return secureNote(row, base);
  return login({
    ...base,
    username: row("username"),
    password: row("password"),
    urls: [row("url")],
    totp: row("totp"),
    notes: row("extra"),
  });
};

export const parseLastPassCsv: Parser = (input) => {
  const table = readTableWith(input, ["url", "username", "password", "extra", "name", "grouping"]);
  return table.ok ? ok(table.value.rows.map(entryOf)) : table;
};
