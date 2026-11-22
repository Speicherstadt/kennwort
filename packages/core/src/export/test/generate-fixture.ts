/**
 * Writes import/fixtures/kennwort-export.json: Weber Haustechnik's vaults as Kennwort's own
 * encrypted export (F-13) under the fixtures' password, for the import's format tests. Dev only;
 * run with `bun packages/core/src/export/test/generate-fixture.ts`.
 */
import { writeFileSync } from "node:fs";
import { writeKennwortExport } from "../kennwort-json.ts";
import { WEBER } from "./weber.ts";

const file = await writeKennwortExport("Weber-Haustechnik-2026", {
  version: 1,
  exportedAt: 1_800_000_000_000,
  vaults: WEBER,
});
writeFileSync(new URL("../../import/fixtures/kennwort-export.json", import.meta.url), file);
