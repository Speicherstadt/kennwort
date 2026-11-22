/**
 * Team Password Manager's CSV export (Passwords → Export, or a project's Export): a header line,
 * then one password per row, every value in double quotes, UTF-8. The columns, in this order:
 * project name, password name, access information, username, e-mail, password, notes, tags (comma
 * between them), the names of the custom fields (comma between them), the values of custom fields
 * 1 to 10, expiry date (mm-dd-yyyy). Source: https://teampasswordmanager.com/docs/export/ and its
 * sample file; the header's wording differs between versions and languages, so the columns are
 * read by place. The export does not say which custom fields were encrypted, so all are secret.
 */
import { err, ok } from "../result.ts";
import { readRows } from "./csv.ts";
import { custom, type DraftField, login } from "./entry.ts";
import type { ImportedEntry, Parser } from "./types.ts";

const COLUMNS = 20;
const CUSTOM_FIRST = 9;
const CUSTOM_COUNT = 10;

/** The custom fields: the names cell says what fields 1 to 10 hold, in order */
const customFields = (names: string, cells: string[]): DraftField[] => {
  const labels = names.split(",");
  return cells
    .slice(CUSTOM_FIRST, CUSTOM_FIRST + CUSTOM_COUNT)
    .map((value, index) => custom(labels[index]?.trim() || `Custom ${index + 1}`, value, "secret"));
};

/** mm-dd-yyyy as yyyy-mm-dd, so no reader takes the month for the day; anything else as written */
const isoDate = (value: string) => value.trim().replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$1-$2");

/** Access information is a link or host when it has no spaces, otherwise a note such as a place */
const isAddress = (access: string) => !/\s/.test(access.trim());

const entryOf = (cells: string[]): ImportedEntry => {
  const cell = (index: number) => cells[index] ?? "";
  const [access, username, email] = [cell(2), cell(3), cell(4)];
  return login({
    title: cell(1),
    username: username || email,
    password: cell(5),
    urls: isAddress(access) ? [access] : [],
    fields: [
      custom("Access", isAddress(access) ? "" : access),
      custom("Email", username === "" ? "" : email, "email"),
      ...customFields(cell(8), cells),
      custom("Expiry date", isoDate(cell(19))),
    ],
    notes: cell(6),
    tags: cell(7).split(","),
    folders: [cell(0)],
  });
};

/** A row of empty cells gives an entry with neither title nor fields */
const hasContent = (entry: ImportedEntry) =>
  entry.content.title !== "" || entry.content.fields.length > 0;

export const parseTpmCsv: Parser = (input) => {
  const rows = readRows(input);
  if (!rows.ok) return rows;
  const [header, ...records] = rows.value;
  if ((header?.length ?? 0) < COLUMNS) return err("wrong-format");
  return ok(records.map(entryOf).filter(hasContent));
};
