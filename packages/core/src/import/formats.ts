/**
 * Every export Kennwort reads (docs/plan.md, Import und Export), for the import flow (K-501) to
 * offer by vendor. The CSV of any table needs a mapping first and is `parseTableCsv` in table.ts.
 */
import { checkKennwortExport, unlockKennwortExport } from "../export/kennwort-json.ts";
import { parseAegisJson } from "./aegis-json.ts";
import { parseBitwardenCsv } from "./bitwarden-csv.ts";
import { checkBitwardenJson, unlockBitwardenJson } from "./bitwarden-protected.ts";
import { parseChromeCsv } from "./chrome-csv.ts";
import { parseDashlaneCsv } from "./dashlane-csv.ts";
import { parseDashlaneZip } from "./dashlane-zip.ts";
import { parseEnpassJson } from "./enpass-json.ts";
import { parseFirefoxCsv } from "./firefox-csv.ts";
import { parseGoogleMigration } from "./google-migration.ts";
import { checkKdbx, unlockKdbx } from "./kdbx.ts";
import { parseKeePassCsv, parseKeePassXcCsv } from "./keepass-csv.ts";
import { parseKeePassXml } from "./keepass-xml.ts";
import { parseKeeperCsv } from "./keeper-csv.ts";
import { parseLastPassCsv } from "./lastpass-csv.ts";
import { parseNordPassCsv } from "./nordpass-csv.ts";
import { parseOnePassword1pux } from "./onepassword-1pux.ts";
import { parseOnePasswordCsv } from "./onepassword-csv.ts";
import { parsePassboltCsv } from "./passbolt-csv.ts";
import { parseProtonPassJson } from "./protonpass-json.ts";
import { parseProtonPassZip } from "./protonpass-zip.ts";
import { parseSafariCsv } from "./safari-csv.ts";
import { parseTwoFasJson } from "./twofas-json.ts";
import type { FileParser, LockedParser } from "./types.ts";

/**
 * `vendor` is the product name only; the import flow says the rest in its own texts (Paraglide).
 * The parsers of ZIP containers answer asynchronously, the others at once. Google Authenticator's
 * export is no file but QR codes (`file: "QR"`): the import flow scans them or takes the pasted
 * links, one per line, and hands those on as text. An encrypted file with `unlock` (KeePass's
 * KDBX, Kennwort's own export) needs its password first: `parse` only checks the file, `unlock` opens it.
 */
export type ImportFormat = {
  id: string;
  vendor: string;
  file: string;
  parse: FileParser;
  unlock?: LockedParser;
  /**
   * The file may come plain or password-protected (Bitwarden's JSON): `parse` reads a plain one
   * itself and answers `encrypted` for a protected one, and only then does the import flow ask for
   * the password and call `unlock`. Without it, a format with `unlock` always needs the password.
   */
  sometimesEncrypted?: true;
};

export const IMPORT_FORMATS: readonly ImportFormat[] = [
  // Kennwort's own encrypted export (K-504, F-13), opened with its passphrase
  {
    id: "kennwort-json",
    vendor: "Kennwort",
    file: "JSON",
    parse: checkKennwortExport,
    unlock: unlockKennwortExport,
  },
  // Plain, or password-protected and then opened with the export password (K-502 Teil 4)
  {
    id: "bitwarden-json",
    vendor: "Bitwarden",
    file: "JSON",
    parse: checkBitwardenJson,
    unlock: unlockBitwardenJson,
    sometimesEncrypted: true,
  },
  { id: "bitwarden-csv", vendor: "Bitwarden", file: "CSV", parse: parseBitwardenCsv },
  { id: "lastpass-csv", vendor: "LastPass", file: "CSV", parse: parseLastPassCsv },
  { id: "1password-1pux", vendor: "1Password", file: "1PUX", parse: parseOnePassword1pux },
  { id: "1password-csv", vendor: "1Password", file: "CSV", parse: parseOnePasswordCsv },
  {
    id: "keepass-kdbx",
    vendor: "KeePass / KeePassXC",
    file: "KDBX",
    parse: checkKdbx,
    unlock: unlockKdbx,
  },
  { id: "keepass-xml", vendor: "KeePass", file: "XML", parse: parseKeePassXml },
  { id: "keepassxc-csv", vendor: "KeePassXC", file: "CSV", parse: parseKeePassXcCsv },
  { id: "keepass-csv", vendor: "KeePass", file: "CSV", parse: parseKeePassCsv },
  { id: "passbolt-csv", vendor: "Passbolt", file: "CSV", parse: parsePassboltCsv },
  { id: "dashlane-zip", vendor: "Dashlane", file: "ZIP", parse: parseDashlaneZip },
  { id: "dashlane-csv", vendor: "Dashlane", file: "CSV", parse: parseDashlaneCsv },
  { id: "protonpass-zip", vendor: "Proton Pass", file: "ZIP", parse: parseProtonPassZip },
  { id: "protonpass-json", vendor: "Proton Pass", file: "JSON", parse: parseProtonPassJson },
  { id: "keeper-csv", vendor: "Keeper", file: "CSV", parse: parseKeeperCsv },
  { id: "nordpass-csv", vendor: "NordPass", file: "CSV", parse: parseNordPassCsv },
  { id: "enpass-json", vendor: "Enpass", file: "JSON", parse: parseEnpassJson },
  { id: "chrome-csv", vendor: "Chrome / Edge", file: "CSV", parse: parseChromeCsv },
  { id: "firefox-csv", vendor: "Firefox", file: "CSV", parse: parseFirefoxCsv },
  { id: "safari-csv", vendor: "Safari", file: "CSV", parse: parseSafariCsv },
  // i18n-ignore: product name
  {
    id: "google-authenticator",
    vendor: "Google Authenticator",
    file: "QR",
    parse: parseGoogleMigration,
  },
  { id: "aegis-json", vendor: "Aegis", file: "JSON", parse: parseAegisJson },
  { id: "2fas-json", vendor: "2FAS", file: "2FAS", parse: parseTwoFasJson },
];
