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
  "kennwort-json": () => m.import_howto_kennwort_json(),
  "bitwarden-json": () => m.import_howto_bitwarden_json(),
  "bitwarden-csv": () => m.import_howto_bitwarden_csv(),
  "lastpass-csv": () => m.import_howto_lastpass_csv(),
  "1password-1pux": () => m.import_howto_onepassword_1pux(),
  "1password-csv": () => m.import_howto_onepassword_csv(),
  "keepass-kdbx": () => m.import_howto_keepass_kdbx(),
  "keepass-xml": () => m.import_howto_keepass_xml(),
  "keepassxc-csv": () => m.import_howto_keepassxc_csv(),
  "keepass-csv": () => m.import_howto_keepass_csv(),
  "passbolt-csv": () => m.import_howto_passbolt_csv(),
  "dashlane-zip": () => m.import_howto_dashlane_zip(),
  "dashlane-csv": () => m.import_howto_dashlane_csv(),
  "protonpass-zip": () => m.import_howto_protonpass_zip(),
  "protonpass-json": () => m.import_howto_protonpass_json(),
  "keeper-csv": () => m.import_howto_keeper_csv(),
  "nordpass-csv": () => m.import_howto_nordpass_csv(),
  "enpass-json": () => m.import_howto_enpass_json(),
  "tpm-csv": () => m.import_howto_tpm_csv(),
  "cxf-json": () => m.import_howto_cxf_json(),
  "chrome-csv": () => m.import_howto_chrome_csv(),
  "firefox-csv": () => m.import_howto_firefox_csv(),
  "safari-csv": () => m.import_howto_safari_csv(),
  "google-authenticator": () => m.import_howto_google_authenticator(),
  "aegis-json": () => m.import_howto_aegis_json(),
  "2fas-json": () => m.import_howto_twofas(),
};

/** Products the app names with more than core does */
const NAMED: Record<string, () => string> = {
  "safari-csv": () => m.import_vendor_safari(),
  "chrome-csv": () => m.import_vendor_chrome(),
  "cxf-json": () => m.import_vendor_cxf(),
};

const ACCEPT: Record<string, string> = {
  JSON: ".json,application/json",
  XML: ".xml,text/xml,application/xml",
  CSV: ".csv,text/csv",
  ZIP: ".zip,application/zip",
  "1PUX": ".1pux",
  "2FAS": ".2fas,.json,application/json",
  KDBX: ".kdbx",
};

/** Files the app names with more than core does; a QR code is no file at all */
const FILE_NAMED: Record<string, () => string> = {
  QR: () => m.import_file_qr(),
  "2FAS": () => ".2fas",
};

/** Google Authenticator exports QR codes: the import scans them or takes the pasted links */
export const isQr = (choice: VendorChoice) => choice.format?.file === "QR";

/**
 * An encrypted file such as KeePass's database: the import asks for its password with the file.
 * Bitwarden's JSON may come plain; the import asks only once its file says it is protected.
 */
export const isLocked = (choice: VendorChoice) =>
  choice.format?.unlock !== undefined && !choice.format.sometimesEncrypted;

/** Whether a file that answered `encrypted` can be opened with its password after all */
export const opensWhenEncrypted = (choice: VendorChoice) =>
  choice.format?.sometimesEncrypted === true;

const choiceOf = (format: ImportFormat): VendorChoice => ({
  id: format.id,
  label: () =>
    m.import_vendor({
      vendor: NAMED[format.id]?.() ?? format.vendor,
      file: FILE_NAMED[format.file]?.() ?? format.file,
    }),
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
