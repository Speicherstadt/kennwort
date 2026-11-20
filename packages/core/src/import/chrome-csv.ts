/**
 * Chrome's password export (Settings → Passwords → Export), which Edge, Brave, Vivaldi and Opera
 * write the same way: `name,url,username,password` and, in current versions, `note`, with CRLF.
 * Source: the structure of real exports as in Bitwarden's chrome-csv test data (bitwarden/clients,
 * libs/importer).
 */
import { tableParser } from "./table.ts";

export const parseChromeCsv = tableParser({
  columns: { title: "name", url: "url", username: "username", password: "password", notes: "note" },
  required: ["name", "url", "username", "password"],
});
