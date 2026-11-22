/**
 * Proton Pass's unencrypted export as it is downloaded: a ZIP with `Proton Pass/data.json`, read
 * by the JSON parser (protonpass-json.ts). The attachments beside it stay out.
 */
import { parseProtonPassJson } from "./protonpass-json.ts";
import type { ZipParser } from "./types.ts";
import { parseZipped } from "./zip.ts";

export const parseProtonPassZip: ZipParser = parseZipped(
  "Proton Pass/data.json", // i18n-ignore: file name in the vendor's ZIP
  parseProtonPassJson,
);
