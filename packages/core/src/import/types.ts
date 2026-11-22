/**
 * What every import parser returns (K-502): entries in Kennwort's own content format (P-09), each
 * with the folders or collections the other manager kept it in, so the import flow (K-501) can
 * offer them as vaults. A parser is a pure function: file in, entries out, errors as values.
 */
import type { EntryContent } from "../sync/content.ts";

export type ImportedEntry = {
  content: EntryContent;
  /** Folder paths or collection names from the other manager, `/` between levels; may be empty */
  folders: string[];
};

export type ImportError =
  /** Bytes that are not UTF-8 text */
  | "not-text"
  /** A quote that never closes */
  | "bad-csv"
  | "bad-json"
  | "bad-xml"
  /** Readable, but not the export this parser reads (other columns, other structure) */
  | "wrong-format"
  /** An encrypted export; it needs the export password first */
  | "encrypted"
  /** Bitwarden's account-restricted export: only that Bitwarden account opens it (K-502 Teil 4) */
  | "account-encrypted"
  /** An export the password does not open (Bitwarden's password-protected JSON) */
  | "wrong-password"
  /** An encrypted export whose content was changed or cut, or whose parts are missing */
  | "damaged"
  /** Not a ZIP, or one whose lengths and offsets do not fit together */
  | "bad-zip"
  /** A ZIP in a form the reader leaves out: ZIP64, across disks, another compression method */
  | "unsupported-zip"
  /** More than an export ever holds: too many files or bytes, or packed too tightly */
  | "too-large"
  /** Some of the QR codes an authenticator split its export into are missing (K-503) */
  | "incomplete"
  /** A KeePass database (KDBX) the password or key file does not open */
  | "wrong-key"
  /** A KeePass database whose bytes were changed or cut, or that breaks the format */
  | "bad-kdbx"
  /** An encrypted file in a form the reader leaves out: KDBX 3.1, Twofish, another KDF or cipher */
  | "unsupported"
  /** An encrypted file whose KDF costs more than the limits allow (KDBX_LIMITS, BITWARDEN_LIMITS) */
  | "too-costly"
  /** A key file that says it is KeePass's XML key file but is broken */
  | "bad-key-file";

/**
 * The entries, or why not. An authenticator's export can hold codes Kennwort cannot work out
 * (HOTP, Steam and the like); its parser leaves them out and says how many in `skipped`.
 */
export type ImportResult =
  | { ok: true; value: ImportedEntry[]; skipped?: number }
  | { ok: false; error: ImportError };
export type Parser = (input: string | Uint8Array) => ImportResult;
/** A parser of a ZIP container: unpacking is asynchronous (`DecompressionStream`) */
export type ZipParser = (bytes: Uint8Array) => Promise<ImportResult>;
/** What the import flow calls with the file's bytes, either kind */
export type FileParser = (bytes: Uint8Array) => ImportResult | Promise<ImportResult>;
/** What opens an encrypted file such as a KeePass database: its password and key file */
export type ImportKey = { password: string; keyFile?: Uint8Array | undefined };
/** A parser of an encrypted file: it needs the key, and deriving it takes time */
export type LockedParser = (bytes: Uint8Array, key: ImportKey) => Promise<ImportResult>;
