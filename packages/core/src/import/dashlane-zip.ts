/**
 * Dashlane's CSV export as it is downloaded: a ZIP with one CSV per kind (credentials, secure
 * notes, payments, IDs, personal info), each read by the CSV parser (dashlane-csv.ts) and
 * overwritten afterwards. A CSV of a kind that parser does not know (a newer export) is left out;
 * a broken one ends the import, so nothing goes missing without a word.
 */
import { err, ok } from "../result.ts";
import { parseDashlaneCsv } from "./dashlane-csv.ts";
import type { ImportedEntry, ZipParser } from "./types.ts";
import { readZip } from "./zip.ts";

export const parseDashlaneZip: ZipParser = async (bytes) => {
  const zip = await readZip(bytes, (name) => name.endsWith(".csv"));
  if (!zip.ok) return zip;
  const entries: ImportedEntry[] = [];
  let known = 0;
  for (const file of zip.value) {
    const parsed = parseDashlaneCsv(file.bytes);
    file.bytes.fill(0);
    if (parsed.ok) {
      known++;
      entries.push(...parsed.value);
    } else if (parsed.error !== "wrong-format") return parsed;
  }
  return known > 0 ? ok(entries) : err("wrong-format");
};
