/**
 * Safari and Apple's Passwords app (File → Export Passwords): `Title,URL,Username,Password,Notes,
 * OTPAuth`; older Safari wrote only the first four, with `Url`. Source: the structure of real
 * exports as in Bitwarden's safari-csv test data (bitwarden/clients, libs/importer).
 */
import { tableParser } from "./table.ts";

export const parseSafariCsv = tableParser({
  columns: {
    title: "Title", // i18n-ignore: column name in the vendor's export
    url: "URL",
    username: "Username",
    password: "Password",
    notes: "Notes",
    totp: "OTPAuth",
  },
  required: ["Title", "URL", "Username", "Password"],
});
