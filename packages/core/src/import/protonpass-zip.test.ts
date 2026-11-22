import { describe, expect, it } from "vitest";
import { parseProtonPassJson } from "./protonpass-json.ts";
import { parseProtonPassZip } from "./protonpass-zip.ts";
import { compact, fixture } from "./test/helpers.ts";
import { buildZip } from "./test/zip.ts";

// K-502 Teil 2: Proton Pass's export as downloaded, `Proton Pass/data.json` in a ZIP
describe("Proton Pass ZIP (K-502)", () => {
  it("reads data.json from the archive", async () => {
    const expected = compact(parseProtonPassJson(fixture("protonpass.json")));
    expect(expected.length).toBeGreaterThan(5);
    expect(compact(await parseProtonPassZip(fixture("protonpass.zip")))).toEqual(expected);
  });

  it("refuses an archive without it, and what is not a ZIP", async () => {
    const loose = buildZip([{ name: "data.json", data: fixture("protonpass.json") }]);
    expect(await parseProtonPassZip(loose.bytes)).toEqual({ ok: false, error: "wrong-format" });
    expect(await parseProtonPassZip(fixture("protonpass.json"))).toEqual({
      ok: false,
      error: "bad-zip",
    });
  });
});
