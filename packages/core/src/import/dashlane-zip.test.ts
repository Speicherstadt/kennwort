import { describe, expect, it } from "vitest";
import { parseDashlaneCsv } from "./dashlane-csv.ts";
import { parseDashlaneZip } from "./dashlane-zip.ts";
import { compact, fixture } from "./test/helpers.ts";
import { buildZip } from "./test/zip.ts";

// K-502 Teil 2: Dashlane's export as downloaded, one CSV per kind in a ZIP
const CSV_FILES = [
  "dashlane-credentials.csv",
  "dashlane-securenotes.csv",
  "dashlane-payments.csv",
  "dashlane-ids.csv",
  "dashlane-personalinfo.csv",
];

const entriesOf = (name: string) => {
  const result = compact(parseDashlaneCsv(fixture(name)));
  return typeof result === "string" ? [] : result;
};

describe("Dashlane ZIP (K-502)", () => {
  it("reads every CSV of the export, stored and deflated, in the order of the archive", async () => {
    const expected = CSV_FILES.flatMap(entriesOf);
    expect(expected).toHaveLength(8);
    expect(compact(await parseDashlaneZip(fixture("dashlane.zip")))).toEqual(expected);
  });

  it("leaves out a CSV of a kind it does not know and everything that is not a CSV", async () => {
    const zip = buildZip([
      { name: "passkeys.csv", data: "rpId,credentialId\nportal.example,abc\n" },
      { name: "README.txt", data: "username,title,password,url\nmax,Lager,Pumpe-7,\n" },
      { name: "credentials.csv", data: fixture("dashlane-credentials.csv") },
    ]);
    expect(compact(await parseDashlaneZip(zip.bytes))).toEqual(
      entriesOf("dashlane-credentials.csv"),
    );
  });

  it("ends at a broken CSV rather than leave its entries out", async () => {
    const zip = buildZip([
      { name: "credentials.csv", data: fixture("dashlane-credentials.csv") },
      { name: "securenotes.csv", data: 'title,note\n"Tresor,offen\n' },
    ]);
    expect(await parseDashlaneZip(zip.bytes)).toEqual({ ok: false, error: "bad-csv" });
  });

  it("refuses an archive without a CSV it knows, and what is not a ZIP", async () => {
    const other = buildZip([{ name: "passkeys.csv", data: "rpId\nx\n" }]);
    expect(await parseDashlaneZip(other.bytes)).toEqual({ ok: false, error: "wrong-format" });
    expect(await parseDashlaneZip(buildZip([]).bytes)).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(await parseDashlaneZip(fixture("dashlane-credentials.csv"))).toEqual({
      ok: false,
      error: "bad-zip",
    });
  });
});
