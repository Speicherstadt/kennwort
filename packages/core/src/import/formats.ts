/**
 * Every export Kennwort reads (docs/plan.md, Import und Export), for the import flow (K-501) to
 * offer by vendor. The CSV of any table needs a mapping first and is `parseTableCsv` in table.ts.
 */
import { parseBitwardenCsv } from "./bitwarden-csv.ts";
import { parseBitwardenJson } from "./bitwarden-json.ts";
import { parseChromeCsv } from "./chrome-csv.ts";
import { parseDashlaneCsv } from "./dashlane-csv.ts";
import { parseEnpassJson } from "./enpass-json.ts";
import { parseFirefoxCsv } from "./firefox-csv.ts";
import { parseKeePassCsv, parseKeePassXcCsv } from "./keepass-csv.ts";
import { parseKeePassXml } from "./keepass-xml.ts";
import { parseKeeperCsv } from "./keeper-csv.ts";
import { parseLastPassCsv } from "./lastpass-csv.ts";
import { parseNordPassCsv } from "./nordpass-csv.ts";
import { parseOnePasswordCsv } from "./onepassword-csv.ts";
import { parsePassboltCsv } from "./passbolt-csv.ts";
import { parseProtonPassJson } from "./protonpass-json.ts";
import { parseSafariCsv } from "./safari-csv.ts";
import type { Parser } from "./types.ts";

/** `vendor` is the product name only; the import flow says the rest in its own texts (Paraglide) */
export type ImportFormat = { id: string; vendor: string; file: string; parse: Parser };

export const IMPORT_FORMATS: readonly ImportFormat[] = [
  { id: "bitwarden-json", vendor: "Bitwarden", file: "JSON", parse: parseBitwardenJson },
  { id: "bitwarden-csv", vendor: "Bitwarden", file: "CSV", parse: parseBitwardenCsv },
  { id: "lastpass-csv", vendor: "LastPass", file: "CSV", parse: parseLastPassCsv },
  { id: "1password-csv", vendor: "1Password", file: "CSV", parse: parseOnePasswordCsv },
  { id: "keepass-xml", vendor: "KeePass", file: "XML", parse: parseKeePassXml },
  { id: "keepassxc-csv", vendor: "KeePassXC", file: "CSV", parse: parseKeePassXcCsv },
  { id: "keepass-csv", vendor: "KeePass", file: "CSV", parse: parseKeePassCsv },
  { id: "passbolt-csv", vendor: "Passbolt", file: "CSV", parse: parsePassboltCsv },
  { id: "dashlane-csv", vendor: "Dashlane", file: "CSV", parse: parseDashlaneCsv },
  { id: "protonpass-json", vendor: "Proton Pass", file: "JSON", parse: parseProtonPassJson },
  { id: "keeper-csv", vendor: "Keeper", file: "CSV", parse: parseKeeperCsv },
  { id: "nordpass-csv", vendor: "NordPass", file: "CSV", parse: parseNordPassCsv },
  { id: "enpass-json", vendor: "Enpass", file: "JSON", parse: parseEnpassJson },
  { id: "chrome-csv", vendor: "Chrome / Edge", file: "CSV", parse: parseChromeCsv },
  { id: "firefox-csv", vendor: "Firefox", file: "CSV", parse: parseFirefoxCsv },
  { id: "safari-csv", vendor: "Safari", file: "CSV", parse: parseSafariCsv },
];
