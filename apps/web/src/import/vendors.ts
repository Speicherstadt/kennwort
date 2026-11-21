/**
 * The vendor step of the import (K-501): every format core reads (IMPORT_FORMATS) and any table.
 * Core names only the product; what the app says around it – "Safari / Apple Passwörter", where
 * the export is – lives in the app's texts (Paraglide), so it reads right in German and English.
 */
import { IMPORT_FORMATS, type ImportFormat } from "@kennwort/core";
import { m } from "@kennwort/ui";

/** The choice for any table, mapped column by column */
export const TABLE = "table";

export type VendorChoice = {
  id: string;
  label: () => string;
  /** Where the export is, in a few steps */
  howTo: () => string;
  /** What the file picker offers */
  accept: string;
  /** The parser; the table has none until its columns are mapped */
  format?: ImportFormat;
};

const HOW_TO: Record<string, () => string> = {
  "bitwarden-json": () => m.import_howto_bitwarden_json(),
  "bitwarden-csv": () => m.import_howto_bitwarden_csv(),
  "lastpass-csv": () => m.import_howto_lastpass_csv(),
  "1password-csv": () => m.import_howto_onepassword_csv(),
  "keepass-xml": () => m.import_howto_keepass_xml(),
  "keepassxc-csv": () => m.import_howto_keepassxc_csv(),
  "keepass-csv": () => m.import_howto_keepass_csv(),
  "passbolt-csv": () => m.import_howto_passbolt_csv(),
  "dashlane-csv": () => m.import_howto_dashlane_csv(),
  "protonpass-json": () => m.import_howto_protonpass_json(),
  "keeper-csv": () => m.import_howto_keeper_csv(),
  "nordpass-csv": () => m.import_howto_nordpass_csv(),
  "enpass-json": () => m.import_howto_enpass_json(),
  "chrome-csv": () => m.import_howto_chrome_csv(),
  "firefox-csv": () => m.import_howto_firefox_csv(),
  "safari-csv": () => m.import_howto_safari_csv(),
};

/** Products the app names with more than core does */
const NAMED: Record<string, () => string> = {
  "safari-csv": () => m.import_vendor_safari(),
  "chrome-csv": () => m.import_vendor_chrome(),
};

const ACCEPT: Record<string, string> = {
  JSON: ".json,application/json",
  XML: ".xml,text/xml,application/xml",
  CSV: ".csv,text/csv",
};

const choiceOf = (format: ImportFormat): VendorChoice => ({
  id: format.id,
  label: () =>
    m.import_vendor({ vendor: NAMED[format.id]?.() ?? format.vendor, file: format.file }),
  howTo: HOW_TO[format.id] ?? (() => m.import_howto_other()),
  accept: ACCEPT[format.file] ?? "",
  format,
});

export const vendorChoices = (): VendorChoice[] => [
  ...IMPORT_FORMATS.map(choiceOf),
  {
    id: TABLE,
    label: () => m.import_vendor_table(),
    howTo: () => m.import_howto_table(),
    accept: ACCEPT.CSV ?? "",
  },
];
