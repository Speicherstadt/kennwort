import { EXPORT_ARGON2_V1, sealExport } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { IMPORT_FORMATS } from "../import/formats.ts";
import { fixture } from "../import/test/helpers.ts";
import { encodeBytes } from "../sync/bytes.ts";
import {
  checkKennwortExport,
  unlockKennwortExport,
  unlockKennwortExportWith,
  writeKennwortExport,
} from "./kennwort-json.ts";
import { WEBER } from "./test/weber.ts";

const utf8 = (text: string) => new TextEncoder().encode(text);
const cheap = { m: 8, t: 1, p: 1 };
const payload = { version: 1 as const, exportedAt: 1_800_000_000_000, vaults: WEBER };

describe("writeKennwortExport", () => {
  it("writes one line of JSON that names itself and holds nothing in plain text", async () => {
    const file = await writeKennwortExport("Kessel Rohr", payload);
    const text = new TextDecoder().decode(file);
    expect(text.endsWith("}\n")).toBe(true);
    const json = JSON.parse(text);
    expect(Object.keys(json)).toEqual(["kennwort", "version", "data"]);
    expect(json).toMatchObject({ kennwort: "export", version: 1 });
    for (const secret of ["Sp@rkasse", "jonas", "Büro", "Werkstatt"])
      expect(text).not.toContain(secret);
  }, 30_000);
});

// Round trip: the fixture is the writer's output under the fixtures' password (v1 parameters)
describe("Kennwort export round trip", () => {
  it("brings back every vault's entries exactly, the vault's name as folder", async () => {
    const result = await unlockKennwortExport(fixture("kennwort-export.json"), {
      password: "Weber-Haustechnik-2026",
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual(
      WEBER.flatMap((vault) =>
        vault.entries.map((content) => ({ content, folders: [vault.name] })),
      ),
    );
  }, 30_000);

  it("opens only with the passphrase", async () => {
    expect(
      await unlockKennwortExport(fixture("kennwort-export.json"), { password: "weber" }),
    ).toEqual({ ok: false, error: "wrong-key" });
  }, 30_000);
});

/** A file of version 1 around these F-13 bytes */
const envelope = (data: Uint8Array | string, extra: object = {}) =>
  utf8(
    JSON.stringify({
      kennwort: "export",
      version: 1,
      data: typeof data === "string" ? data : encodeBytes(data),
      ...extra,
    }),
  );

describe("checkKennwortExport", () => {
  it("says a sound file is encrypted, whatever its F-13 bytes", async () => {
    expect(await checkKennwortExport(envelope(new Uint8Array([1, 2])))).toEqual({
      ok: false,
      error: "encrypted",
    });
    // A byte order mark, as an editor might add one, does no harm
    expect(await checkKennwortExport(utf8(`﻿${new TextDecoder().decode(envelope("AA"))}`))).toEqual({
      ok: false,
      error: "encrypted",
    });
  });

  it("tells another format, a newer version, broken JSON and broken data apart", async () => {
    const cases: [Uint8Array, string][] = [
      [Uint8Array.of(0xff, 0xfe, 0x00), "not-text"],
      [utf8("{"), "bad-json"],
      [utf8('{"encrypted":true,"passwordProtected":true}'), "wrong-format"],
      [utf8('{"kennwort":"backup","version":1,"data":""}'), "wrong-format"],
      [utf8('{"kennwort":"export","version":"1","data":""}'), "wrong-format"],
      [utf8('{"kennwort":"export","version":2,"data":""}'), "unsupported"],
      [utf8('{"kennwort":"export","version":1}'), "wrong-format"],
      [envelope("AA=="), "wrong-format"],
      [envelope("A"), "wrong-format"],
      [envelope("AB"), "wrong-format"],
      [envelope(""), "encrypted"],
    ];
    for (const [file, error] of cases)
      expect([new TextDecoder().decode(file), await checkKennwortExport(file)]).toEqual([
        new TextDecoder().decode(file),
        { ok: false, error },
      ]);
  });
});

describe("unlockKennwortExportWith", () => {
  const sealed = async (plain: string) => {
    const { sealExportWith } = await import("@kennwort/crypto");
    return sealExportWith(cheap, "Kessel", new Uint8Array(16), new Uint8Array(24), utf8(plain));
  };

  it("answers the envelope's errors before deriving any key", async () => {
    expect(await unlockKennwortExportWith(cheap, utf8("{"), "Kessel")).toEqual({
      ok: false,
      error: "bad-json",
    });
  });

  it("maps the F-13 errors: wrong passphrase, cut file, unknown version", async () => {
    const file = await sealed(JSON.stringify(payload));
    expect(await unlockKennwortExportWith(cheap, envelope(file), "kessel")).toEqual({
      ok: false,
      error: "wrong-key",
    });
    expect(await unlockKennwortExportWith(cheap, envelope(file.subarray(0, 20)), "Kessel")).toEqual(
      { ok: false, error: "wrong-format" },
    );
    const newer = file.slice();
    newer[0] = 2;
    expect(await unlockKennwortExportWith(cheap, envelope(newer), "Kessel")).toEqual({
      ok: false,
      error: "unsupported",
    });
  });

  it("refuses an authentic payload that is no export of this version", async () => {
    for (const plain of [
      "kein JSON",
      JSON.stringify({ ...payload, version: 2 }),
      JSON.stringify({ ...payload, vaults: [{ name: "x", entries: [{ title: "x" }] }] }),
    ])
      expect(
        await unlockKennwortExportWith(cheap, envelope(await sealed(plain)), "Kessel"),
      ).toEqual({ ok: false, error: "wrong-format" });
    const latin1 = await (await import("@kennwort/crypto")).sealExportWith(
      cheap,
      "Kessel",
      new Uint8Array(16),
      new Uint8Array(24),
      Uint8Array.of(0xff),
    );
    expect(await unlockKennwortExportWith(cheap, envelope(latin1), "Kessel")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });

  it("gives entries of a vault without a name no folder, and drops change marks", async () => {
    const [entry] = WEBER[0]?.entries ?? [];
    const marked = { ...entry, toChange: [{ account: "AAAA", at: 1, fields: ["password"] }] };
    const plain = JSON.stringify({ ...payload, vaults: [{ name: "", entries: [marked] }] });
    expect(await unlockKennwortExportWith(cheap, envelope(await sealed(plain)), "Kessel")).toEqual({
      ok: true,
      value: [{ content: entry, folders: [] }],
    });
  });

  it("uses the v1 parameters through the import format", async () => {
    const format = IMPORT_FORMATS.find((f) => f.id === "kennwort-json");
    expect(format?.unlock).toBe(unlockKennwortExport);
    expect(format?.parse).toBe(checkKennwortExport);
    const file = envelope(await sealExport("Kessel", utf8(JSON.stringify(payload))));
    expect((await unlockKennwortExportWith(EXPORT_ARGON2_V1, file, "Kessel")).ok).toBe(true);
    expect((await unlockKennwortExportWith(cheap, file, "Kessel")).ok).toBe(false);
  }, 30_000);
});
