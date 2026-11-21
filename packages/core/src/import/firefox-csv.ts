/**
 * Firefox's password export (about:logins → Export): `url,username,password,httpRealm,
 * formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged`, every cell quoted. It has no
 * title, so the entry takes the host. The row of Firefox's own account (`chrome://FirefoxAccounts`)
 * holds the sync keys, not a login, and stays out. Source: the structure of real exports as in
 * Bitwarden's firefox-csv test data (bitwarden/clients, libs/importer).
 */
import { tableParser } from "./table.ts";

export const parseFirefoxCsv = tableParser({
  columns: { url: "url", username: "username", password: "password" },
  required: ["url", "username", "password", "guid"],
  skip: (row) => row("url").startsWith("chrome://"),
});
