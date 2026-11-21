/**
 * Passbolt's CSV export in its KeePass layout (`csv-kdbx`): `Title,Username,URL,Password,Notes,
 * Group,TOTP`, the group as the folder path without a root. Source: passbolt_browser_extension,
 * model/import/resources/csvRowParser/csvKdbxRowParser.js.
 */
import { tableParser } from "./table.ts";

export const parsePassboltCsv = tableParser({
  columns: {
    title: "Title", // i18n-ignore: column name in the vendor's export
    username: "Username",
    url: "URL",
    password: "Password",
    notes: "Notes",
    folder: "Group",
    totp: "TOTP",
  },
  required: ["Title", "Username", "URL", "Password", "Group"],
});
