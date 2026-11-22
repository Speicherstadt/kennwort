import { constants, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip, patched, type ZipSpec } from "./test/zip.ts";
import type { ImportResult } from "./types.ts";
import { crc32, parseZipped, readZip, ZIP_LIMITS, type ZipLimits } from "./zip.ts";

// K-502 Teil 2: the ZIP reader of the export containers, after PKWARE's APPNOTE.TXT. Offsets in
// the headers: central 8 flags, 10 method, 16 CRC, 20 packed, 24 size, 28 name length, 30 extra,
// 32 comment, 42 local offset; local 26 name length, 28 extra; end 4 disk, 6 directory disk,
// 8 entries here, 10 entries, 12 directory size, 16 directory offset, 20 comment length.

const everything = () => true;
const text = new TextDecoder();
const bytesOf = (value: string) => new TextEncoder().encode(value).length;

/** The files as names and texts, or the error */
const read = async (bytes: Uint8Array, wanted = everything, limits?: ZipLimits) => {
  const zip = await readZip(bytes, wanted, limits);
  return zip.ok ? zip.value.map((f) => [f.name, text.decode(f.bytes)]) : zip.error;
};

const CSV = "username,title,password\njonas@weber-haustechnik.example,Portal,Sommer2026!\n";
const NOTE = "Anna: Schlüssel für die Werkstatt liegt bei Sandra.";
const files: ZipSpec[] = [
  { name: "credentials.csv", data: CSV },
  { name: "securenotes.csv", data: NOTE, method: "stored" },
  { name: "Proton Pass/", data: "", method: "stored" },
];
const zip = buildZip(files);
const one = (spec: Partial<ZipSpec> = {}) => buildZip([{ name: "a.txt", data: CSV, ...spec }]);

describe("reading a ZIP (K-502)", () => {
  it("reads stored and deflated files in the order of the directory", async () => {
    expect(await read(zip.bytes)).toEqual([
      ["credentials.csv", CSV],
      ["securenotes.csv", NOTE],
      ["Proton Pass/", ""],
    ]);
  });

  it("unpacks only the files asked for", async () => {
    expect(await read(zip.bytes, (name) => name.endsWith("notes.csv"))).toEqual([
      ["securenotes.csv", NOTE],
    ]);
  });

  it("reads an archive without files, and one with a comment", async () => {
    expect(await read(buildZip([]).bytes)).toEqual([]);
    const commented = buildZip(files.slice(0, 1), "Export PK\x05\x06 von Max");
    expect(await read(commented.bytes)).toEqual([["credentials.csv", CSV]]);
  });

  it("reads a file with an empty name and no data at the very edge of each part", async () => {
    expect(await read(buildZip([{ name: "", data: "", method: "stored" }]).bytes)).toEqual([
      ["", ""],
    ]);
  });

  it("reads past extra fields and file comments", async () => {
    const extra = new Uint8Array([0x55, 0x54, 5, 0, 1, 0x80, 0x1a, 0x65, 0x6a]);
    const built = buildZip([
      { name: "a.csv", data: CSV, extra, comment: "Jonas" },
      { name: "b.csv", data: NOTE, method: "stored", extra, comment: "Max" },
    ]);
    expect(await read(built.bytes)).toEqual([
      ["a.csv", CSV],
      ["b.csv", NOTE],
    ]);
  });

  it("hands out copies: overwriting a stored file leaves the archive as it was", async () => {
    const stored = one({ method: "stored" }).bytes;
    const before = stored.slice();
    const result = await readZip(stored, everything);
    if (result.ok) for (const file of result.value) file.bytes.fill(0);
    expect(stored).toEqual(before);
  });

  it("checks CRC-32 against the published check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("what is not a ZIP it reads", () => {
  it("refuses a file without an end record that fits", async () => {
    expect(await read(new TextEncoder().encode(CSV))).toBe("bad-zip");
    expect(await read(new Uint8Array(21))).toBe("bad-zip");
    expect(await read(zip.bytes.subarray(0, zip.bytes.length - 1))).toBe("bad-zip");
    expect(await read(buildZip(files, "Notiz").bytes.subarray(0, -1))).toBe("bad-zip");
  });

  it("refuses ZIP64", async () => {
    const locator = patched(new Uint8Array(20), 0, 0x07064b50, 4);
    const empty = buildZip([]).bytes;
    expect(await read(new Uint8Array([...locator, ...empty]))).toBe("unsupported-zip");
    const head = zip.bytes.subarray(0, zip.end);
    const withLocator = new Uint8Array([...head, ...locator, ...zip.bytes.subarray(zip.end)]);
    expect(await read(withLocator)).toBe("unsupported-zip");
  });

  it("refuses archives across disks", async () => {
    expect(await read(patched(zip.bytes, zip.end + 4, 1, 2))).toBe("unsupported-zip");
    expect(await read(patched(zip.bytes, zip.end + 6, 1, 2))).toBe("unsupported-zip");
    expect(await read(patched(zip.bytes, zip.end + 8, 2, 2))).toBe("unsupported-zip");
  });

  it("refuses a directory that reaches past the end record", async () => {
    expect(await read(patched(zip.bytes, zip.end + 12, 1000, 4))).toBe("bad-zip");
    expect(await read(patched(zip.bytes, zip.end + 16, 0x7fffffff, 4))).toBe("bad-zip");
  });

  it("refuses broken directory headers", async () => {
    const [first = 0, second = 0] = zip.central;
    expect(await read(patched(zip.bytes, second, 0x02014b51, 4))).toBe("bad-zip");
    expect(await read(patched(zip.bytes, first + 28, 0xffff, 2))).toBe("bad-zip");
    expect(await read(patched(zip.bytes, first + 30, 4, 2))).toBe("bad-zip");
    expect(await read(patched(zip.bytes, first + 32, 4, 2))).toBe("bad-zip");
    const last = zip.central.at(-1) ?? 0;
    expect(await read(patched(zip.bytes, last + 32, 4, 2))).toBe("bad-zip");
    // A header cut short by the end of the directory, though its signature is there
    const cut = buildZip([{ name: "abPK\x01\x02", data: "", method: "stored" }]);
    const short = patched(patched(cut.bytes, (cut.central[0] ?? 0) + 28, 2, 2), cut.end + 8, 2, 2);
    expect(await read(patched(short, cut.end + 10, 2, 2))).toBe("bad-zip");
    // More entries than the directory holds
    const more = patched(patched(zip.bytes, zip.end + 8, 4, 2), zip.end + 10, 4, 2);
    expect(await read(more)).toBe("bad-zip");
  });

  it("refuses names that climb out of their folder", async () => {
    const unsafe = ["../x.csv", "a/../b.csv", "a/..", "/etc/passwd", "a\\b.csv", "C:x", "c:/x"];
    for (const name of unsafe)
      expect([name, await read(buildZip([{ name, data: "" }]).bytes)]).toEqual([name, "bad-zip"]);
    const safe = ["notes:2024.csv", "1:x", "a..b/c", "..a", "dir/", "Proton Pass/data.json"];
    for (const name of safe)
      expect([name, await read(buildZip([{ name, data: "x" }]).bytes)]).toEqual([
        name,
        [[name, "x"]],
      ]);
  });

  it("refuses a name that appears twice", async () => {
    const twice = buildZip([
      { name: "data.json", data: "{}" },
      { name: "data.json", data: "[]" },
    ]);
    expect(await read(twice.bytes)).toBe("bad-zip");
  });

  it("reports an encrypted file it is asked for, and lets one it is not asked for be", async () => {
    const locked = buildZip([
      { name: "a.txt", data: "x" },
      { name: "b.txt", data: "y", flags: 1 },
    ]);
    expect(await read(locked.bytes)).toBe("encrypted");
    expect(await read(locked.bytes, (name) => name === "a.txt")).toEqual([["a.txt", "x"]]);
  });

  it("refuses other compression methods", async () => {
    const built = one();
    expect(await read(patched(built.bytes, (built.central[0] ?? 0) + 10, 12, 2))).toBe(
      "unsupported-zip",
    );
  });

  it("refuses broken local headers and data that runs into the directory", async () => {
    const built = one();
    const centralAt = built.central[0] ?? 0;
    expect(await read(patched(built.bytes, 0, 0x04034b51, 4))).toBe("bad-zip");
    expect(await read(patched(built.bytes, centralAt + 42, centralAt - 29, 4))).toBe("bad-zip");
    expect(await read(patched(built.bytes, 26, 0x00ff, 2))).toBe("bad-zip");
    expect(await read(patched(built.bytes, 28, 1, 2))).toBe("bad-zip");
    expect(await read(patched(built.bytes, centralAt + 42, centralAt - 2, 4))).toBe("bad-zip");
    expect(await read(patched(built.bytes, centralAt + 42, 0x7fffffff, 4))).toBe("bad-zip");
    const stored = one({ method: "stored" });
    const storedAt = stored.central[0] ?? 0;
    expect(await read(patched(stored.bytes, storedAt + 20, bytesOf(CSV) + 1, 4))).toBe("bad-zip");
    expect(await read(patched(stored.bytes, 28, 1, 2))).toBe("bad-zip");
  });

  it("refuses lengths that do not match what comes out", async () => {
    const built = one();
    const at = built.central[0] ?? 0;
    expect(await read(patched(built.bytes, at + 24, CSV.length - 1, 4))).toBe("bad-zip");
    expect(await read(patched(built.bytes, at + 24, CSV.length + 1, 4))).toBe("bad-zip");
    expect(await read(patched(built.bytes, at + 16, 0x12345678, 4))).toBe("bad-zip");
    const stored = one({ method: "stored" });
    const storedAt = stored.central[0] ?? 0;
    expect(await read(patched(stored.bytes, storedAt + 24, CSV.length - 1, 4))).toBe("bad-zip");
    expect(await read(patched(stored.bytes, storedAt + 16, 0x12345678, 4))).toBe("bad-zip");
  });

  it("refuses a file shorter than declared, even with a CRC that fits the padding", async () => {
    const built = one();
    const at = built.central[0] ?? 0;
    const padded = new TextEncoder().encode(`${CSV}\0`);
    const lying = patched(
      patched(built.bytes, at + 24, padded.length, 4),
      at + 16,
      crc32(padded),
      4,
    );
    expect(await read(lying)).toBe("bad-zip");
  });

  it("refuses deflate data without its final block", async () => {
    const data = new TextEncoder().encode(CSV);
    const open = new Uint8Array(deflateRawSync(data, { finishFlush: constants.Z_SYNC_FLUSH }));
    const built = buildZip([{ name: "a.txt", data: open, method: "stored" }]);
    const at = built.central[0] ?? 0;
    const deflated = patched(patched(built.bytes, at + 10, 8, 2), at + 24, data.length, 4);
    expect(await read(patched(deflated, at + 16, crc32(data), 4))).toBe("bad-zip");
  });

  it("refuses deflate data that is broken or cut short", async () => {
    const built = one();
    const at = built.central[0] ?? 0;
    const dataAt = 30 + "a.txt".length;
    const broken = built.bytes.slice();
    broken.fill(0xff, dataAt, dataAt + 3);
    expect(await read(broken)).toBe("bad-zip");
    const packed = new DataView(built.bytes.buffer).getUint32(at + 20, true);
    expect(await read(patched(built.bytes, at + 20, packed - 4, 4))).toBe("bad-zip");
  });
});

describe("zip bombs", () => {
  const limits = (change: Partial<ZipLimits>): ZipLimits => ({ ...ZIP_LIMITS, ...change });

  it("end at the number of entries", async () => {
    expect(await read(zip.bytes, everything, limits({ entries: 2 }))).toBe("too-large");
    expect(await read(zip.bytes, everything, limits({ entries: 3 }))).toHaveLength(3);
  });

  it("end at the bytes unpacked in all, counting only the files asked for", async () => {
    const size = bytesOf(CSV) + bytesOf(NOTE);
    expect(await read(zip.bytes, everything, limits({ bytes: size - 1 }))).toBe("too-large");
    expect(await read(zip.bytes, everything, limits({ bytes: size }))).toHaveLength(3);
    const csvOnly = (name: string) => name === "credentials.csv";
    expect(await read(zip.bytes, csvOnly, limits({ bytes: CSV.length }))).toHaveLength(1);
  });

  it("end at the compression ratio", async () => {
    const stored = one({ method: "stored" }).bytes;
    expect(await read(stored, everything, limits({ ratio: 1 }))).toHaveLength(1);
    const bomb = buildZip([{ name: "export.data", data: "a".repeat(1_000_000) }]);
    expect(await read(bomb.bytes)).toBe("too-large");
    expect(await read(bomb.bytes, everything, limits({ ratio: 2000 }))).toHaveLength(1);
  });

  it("stop inflating at the declared size when the directory lies", async () => {
    const bomb = buildZip([{ name: "export.data", data: "a".repeat(5_000_000) }]);
    const at = bomb.central[0] ?? 0;
    const lying = patched(bomb.bytes, at + 24, 100, 4);
    expect(await read(lying, everything, limits({ ratio: 1 }))).toBe("bad-zip");
  });
});

describe("one file in a ZIP", () => {
  const seen: Uint8Array[] = [];
  const parse = (bytes: Uint8Array): ImportResult => {
    seen.push(bytes);
    return text.decode(bytes) === "{}" ? { ok: true, value: [] } : { ok: false, error: "bad-json" };
  };
  const parser = parseZipped("Proton Pass/data.json", parse);

  it("goes to its parser and is overwritten afterwards", async () => {
    const built = buildZip([
      { name: "Proton Pass/", data: "", method: "stored" },
      { name: "Proton Pass/data.json", data: "{}" },
    ]);
    expect(await parser(built.bytes)).toEqual({ ok: true, value: [] });
    expect(seen.at(-1)).toEqual(new Uint8Array(2));
    expect(await parser(buildZip([{ name: "Proton Pass/data.json", data: "[" }]).bytes)).toEqual({
      ok: false,
      error: "bad-json",
    });
  });

  it("is missing from another vendor's archive", async () => {
    expect(await parser(buildZip([{ name: "data.json", data: "{}" }]).bytes)).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(await parser(new Uint8Array(3))).toEqual({ ok: false, error: "bad-zip" });
  });
});
