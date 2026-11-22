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
  /** Not a ZIP, or one whose lengths and offsets do not fit together */
  | "bad-zip"
  /** A ZIP in a form the reader leaves out: ZIP64, across disks, another compression method */
  | "unsupported-zip"
  /** More than an export ever holds: too many files or bytes, or packed too tightly */
  | "too-large"
  /** Some of the QR codes an authenticator split its export into are missing (K-503) */
  | "incomplete";

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
