/**
 * What every import parser returns (K-502): entries in Kennwort's own content format (P-09), each
 * with the folders or collections the other manager kept it in, so the import flow (K-501) can
 * offer them as vaults. A parser is a pure function: file in, entries out, errors as values.
 */
import type { Result } from "@kennwort/crypto";
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
  | "encrypted";

export type ImportResult = Result<ImportedEntry[], ImportError>;
export type Parser = (input: string | Uint8Array) => ImportResult;
