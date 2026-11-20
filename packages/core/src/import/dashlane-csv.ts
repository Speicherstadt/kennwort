/**
 * Dashlane's CSV export: a ZIP with one CSV per kind, each read on its own and told apart by its
 * header. `credentials.csv` (`username,username2,username3,title,password,note,url,category,
 * otpSecret`, newer `otpUrl`), `securenotes.csv` (`title,note`), `payments.csv` (cards and bank
 * accounts), `ids.csv` and `personalInfo.csv` (identities). The category becomes the folder.
 * Source: the structure of real exports as in Bitwarden's dashlane-csv test data and importer
 * (bitwarden/clients, libs/importer).
 */
import { err, ok } from "../result.ts";
import { hasColumns, type Row, readTable, type Table } from "./csv.ts";
import { custom, expiry, imported, known, login } from "./entry.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const credential = (row: Row): ImportedEntry =>
  login({
    title: row("title"),
    username: row("username"),
    password: row("password"),
    urls: [row("url")],
    totp: row("otpUrl") || row("otpSecret"),
    fields: [custom("Username 2", row("username2")), custom("Username 3", row("username3"))],
    notes: row("note"),
    folders: [row("category")],
  });

const secureNote = (row: Row): ImportedEntry =>
  imported({ type: "note", title: row("title"), fields: [], notes: row("note") });

const CARD_TYPES = new Set(["payment_card", "credit_card"]);

const card = (row: Row): ImportedEntry =>
  imported({
    type: "card",
    title: row("name") || row("account_name"),
    fields: [
      known("holder", row("account_holder") || row("account_name")),
      known("number", row("cc_number")),
      known("expiry", expiry(row("expiration_month"), row("expiration_year"))),
      known("cvc", row("code")),
      custom("Bank", row("issuing_bank")),
      custom("Country", row("country")),
    ],
    notes: row("note"),
  });

const bankAccount = (row: Row): ImportedEntry =>
  imported({
    type: "note",
    title: row("account_name"),
    fields: [
      custom("Account holder", row("account_holder")),
      custom("Account number", row("account_number"), "secret"),
      custom("Routing number", row("routing_number")),
      custom("Bank", row("issuing_bank")),
      custom("Country", row("country")),
    ],
    notes: row("note"),
  });

const payment = (row: Row) => (CARD_TYPES.has(row("type")) ? card(row) : bankAccount(row));

/** Columns that say what a row is rather than hold a value */
const OWN = new Set(["type", "item_name"]);

/** An identity row: every other filled column as a field under its own name */
const identity =
  (columns: string[]) =>
  (row: Row): ImportedEntry =>
    imported({
      type: "identity",
      title: row("item_name") || row("type"),
      fields: columns.filter((c) => !OWN.has(c)).map((c) => custom(c, row(c))),
    });

type Kind = { columns: readonly string[]; entry: (table: Table) => (row: Row) => ImportedEntry };

/** The files of the export, recognised by their header; the first that fits wins */
const KINDS: readonly Kind[] = [
  { columns: ["username", "title", "password", "url"], entry: () => credential },
  { columns: ["type", "cc_number"], entry: () => payment },
  { columns: ["type", "issue_date"], entry: (table) => identity(table.columns) },
  { columns: ["type", "item_name"], entry: (table) => identity(table.columns) },
  { columns: ["title", "note"], entry: () => secureNote },
];

export const parseDashlaneCsv: Parser = (input) => {
  const table = readTable(input);
  if (!table.ok) return table;
  const kind = KINDS.find((k) => hasColumns(table.value, k.columns));
  if (!kind) return err("wrong-format");
  return ok(table.value.rows.map(kind.entry(table.value)));
};
