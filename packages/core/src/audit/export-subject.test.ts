import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { EXPORT_FORMATS, exportSubject, parseExportSubject } from "./export-subject.ts";

const vaultId = encodeBytes(new Uint8Array(16).fill(0xb0));
const id = encodeBytes(new Uint8Array(16).fill(0x07));

describe("export subject", () => {
  it("names format, scope and the export's ID", () => {
    expect(EXPORT_FORMATS).toEqual(["kennwort-json", "csv", "kdbx"]);
    expect(exportSubject({ format: "kdbx", scope: { kind: "all" }, id })).toBe(`kdbx/all/${id}`);
    expect(exportSubject({ format: "csv", scope: { kind: "vault", vaultId }, id })).toBe(
      `csv/vault:${vaultId}/${id}`,
    );
  });

  it("reads back what it wrote", () => {
    for (const format of EXPORT_FORMATS)
      for (const scope of [{ kind: "all" } as const, { kind: "vault", vaultId } as const])
        expect(parseExportSubject(exportSubject({ format, scope, id }))).toEqual({
          format,
          scope,
          id,
        });
  });

  it("refuses anything else: other formats, scopes, IDs, extra text", () => {
    const refused = [
      "",
      "export-1",
      `xml/all/${id}`,
      `kdbx/some/${id}`,
      `kdbx/all/${id}x`,
      `xkdbx/all/${id}`,
      `kdbx/all/${id.slice(1)}`,
      `kdbx/vault:/${id}`,
      `kdbx/vault:${vaultId.slice(1)}/${id}`,
      `kdbx/all/${id}/more`,
      `kdbx/all/${id.slice(0, 21)}B`,
      `kdbx/vault:${vaultId.slice(0, 21)}B/${id}`,
      `kdbx/all/${id.slice(0, 21)}=`,
      ` kdbx/all/${id}`,
      `kdbx/all/${id}\n`,
      `KDBX/all/${id}`,
    ];
    for (const subject of refused) expect(parseExportSubject(subject)).toBeUndefined();
  });
});
