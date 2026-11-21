/**
 * NordPass's CSV export: one table for every kind, told apart by `type` (`password`,
 * `credit_card`, `identity`, `note`); rows without a type only name a folder. More links and own
 * fields come as JSON inside a cell (`additional_urls`, `custom_fields` with `label`, `type`,
 * `value`). Source: the structure of real exports as in Bitwarden's nordpass-csv test data and
 * importer (bitwarden/clients, libs/importer).
 */
import { z } from "zod";
import { ok } from "../result.ts";
import { type Row, readTableWith } from "./csv.ts";
import { custom, type DraftField, imported, joinLines, known, login } from "./entry.ts";
import { jsonCell } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const Urls = z.array(z.string());
const CustomFields = z.array(z.object({ label: z.string(), type: z.string(), value: z.string() }));

const ownFields = (row: Row): DraftField[] =>
  jsonCell(row("custom_fields"), CustomFields, []).map((field) =>
    custom(field.label, field.value, field.type === "hidden" ? "secret" : "text"),
  );

const common = (row: Row) => ({
  title: row("name"),
  notes: row("note"),
  folders: [row("folder")],
});

const password = (row: Row) =>
  login({
    ...common(row),
    username: row("username"),
    password: row("password"),
    urls: [row("url"), ...jsonCell(row("additional_urls"), Urls, [])],
    fields: ownFields(row),
  });

/** NordPass writes the expiry as `MM / YY` */
const card = (row: Row) =>
  imported({
    ...common(row),
    type: "card",
    fields: [
      known("holder", row("cardholdername")),
      known("number", row("cardnumber")),
      known("expiry", row("expirydate").replaceAll(" ", "")),
      known("cvc", row("cvc")),
      ...ownFields(row),
    ],
  });

const identity = (row: Row) =>
  imported({
    ...common(row),
    type: "identity",
    fields: [
      known("name", row("full_name")),
      known("email", row("email")),
      known("phone", row("phone_number")),
      known(
        "address",
        joinLines(
          row("address1"),
          row("address2"),
          `${row("zipcode")} ${row("city")}`,
          row("state"),
          row("country"),
        ),
      ),
      ...ownFields(row),
    ],
  });

const note = (row: Row) => imported({ ...common(row), type: "note", fields: ownFields(row) });

const KINDS = new Map<string, (row: Row) => ImportedEntry>([
  ["password", password],
  ["credit_card", card],
  ["identity", identity],
  ["note", note],
]);

export const parseNordPassCsv: Parser = (input) => {
  const table = readTableWith(input, ["name", "url", "username", "password", "type", "folder"]);
  if (!table.ok) return table;
  return ok(
    table.value.rows.flatMap((row) => {
      const kind = KINDS.get(row("type"));
      return kind ? [kind(row)] : [];
    }),
  );
};
