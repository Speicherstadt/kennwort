/**
 * Dashlane's CSV export as it is downloaded: a ZIP with one CSV per kind (credentials, secure
 * notes, payments, IDs, personal info), each read by the CSV parser (dashlane-csv.ts) and
 * overwritten afterwards. A CSV of a kind that parser does not know (a newer export) is left out;
 * a broken one ends the import, so nothing goes missing without a word.
 */
import { err, ok } from "../result.ts";
import { parseDashlaneCsv } from "./dashlane-csv.ts";
import type { ImportedEntry, ZipParser } from "./types.ts";
import { parseEachZipped } from "./zip.ts";

export const parseDashlaneZip: ZipParser = async (bytes) => {
  const files = await parseEachZipped(bytes, (name) => name.endsWith(".csv"), parseDashlaneCsv);
  if (!files.ok) return files;
  const entries: ImportedEntry[] = [];
  let known = 0;
  for (const parsed of files.value) {
    if (parsed.ok) {
      known++;
      entries.push(...parsed.value);
    } else if (parsed.error !== "wrong-format") return parsed;
  }
  return known > 0 ? ok(entries) : err("wrong-format");
};
