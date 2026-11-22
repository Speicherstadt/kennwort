/**
 * Reading the export on the device (K-501): the file's bytes go to the chosen vendor's parser in
 * core and never anywhere else. Any table first has its columns mapped (parseTableCsv), starting
 * from a guess by their names. The parsers' errors become texts that say what to do.
 */
import { type Columns, type ImportError, type ImportResult, parseTableCsv } from "@kennwort/core";
import { m } from "@kennwort/ui";
import type { VendorChoice } from "./vendors.ts";

/** The parts of an entry a table's column can fill, in the order the mapping shows them */
export const TABLE_PARTS = [
  "title",
  "username",
  "password",
  "url",
  "totp",
  "notes",
  "folder",
  "tags",
] as const satisfies readonly (keyof Columns)[];

export type TablePart = (typeof TABLE_PARTS)[number];

/**
 * The entries of the file; a table only with a mapping that names at least one column. Unpacking
 * a ZIP container (1PUX, Dashlane, Proton Pass) is asynchronous, so the answer always is.
 */
export const parseChoice = async (
  choice: VendorChoice,
  bytes: Uint8Array,
  columns: Columns = {},
): Promise<ImportResult> =>
  choice.format ? choice.format.parse(bytes) : parseTableCsv(columns)(bytes);

/** Column names that usually hold a part, lowercased, in German and English */
const NAMES: Record<TablePart, readonly string[]> = {
  title: ["title", "titel", "name"],
  username: ["username", "user", "benutzername", "benutzer", "login_username", "e-mail", "email"],
  password: ["password", "passwort", "kennwort", "login_password"],
  url: ["url", "website", "web site", "adresse", "login_uri", "uri"],
  totp: ["totp", "otp", "otpauth", "einmalcode", "login_totp"],
  notes: ["notes", "note", "notizen", "notiz", "bemerkung"],
  folder: ["folder", "ordner", "group", "gruppe"],
  tags: ["tags", "tag"],
};

/** A first mapping from the column names; each column fills at most one part */
export const guessColumns = (columns: readonly string[]): Columns => {
  const taken = new Set<string>();
  const guessed: Columns = {};
  for (const part of TABLE_PARTS) {
    const column = columns.find(
      (c) => !taken.has(c) && NAMES[part].includes(c.trim().toLocaleLowerCase()),
    );
    if (column === undefined) continue;
    taken.add(column);
    guessed[part] = column;
  }
  return guessed;
};

const ERROR_TEXT: Record<ImportError, () => string> = {
  "not-text": () => m.import_error_not_text(),
  "bad-csv": () => m.import_error_bad_csv(),
  "bad-json": () => m.import_error_bad_json(),
  "bad-xml": () => m.import_error_bad_xml(),
  "wrong-format": () => m.import_error_wrong_format(),
  encrypted: () => m.import_error_encrypted(),
  "bad-zip": () => m.import_error_bad_zip(),
  "unsupported-zip": () => m.import_error_unsupported_zip(),
  "too-large": () => m.import_error_too_large(),
};

export const errorText = (error: ImportError) => ERROR_TEXT[error]();
