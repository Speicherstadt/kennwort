/**
 * 1Password 8's CSV export (logins and passwords only): `Title,Url,Username,Password,OTPAuth,
 * Favorite,Archived,Tags,Notes`, tags separated by commas, favorites as `true`. Source: 1Password's
 * export guide (support.1password.com/export) and the columns its export writes. The full 1PUX
 * export comes with the ZIP formats.
 */
import { splitList, tableParser } from "./table.ts";

export const parseOnePasswordCsv = tableParser({
  columns: {
    title: "Title", // i18n-ignore: column name in the vendor's export
    url: "Url",
    username: "Username",
    password: "Password",
    totp: "OTPAuth",
    favorite: "Favorite",
    tags: "Tags",
    notes: "Notes",
  },
  required: ["Title", "Url", "Username", "Password", "OTPAuth"],
  tags: splitList(","),
  favorite: (value) => value.toLowerCase() === "true",
});
