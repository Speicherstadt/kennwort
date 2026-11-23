import { describe, expect, it } from "vitest";
import { checkKdbx, gunzip, KDBX_LIMITS, openKdbx, unlockKdbx } from "./kdbx.ts";
import { readKdbxHeader } from "./kdbx-header.ts";
import { compact, fixture } from "./test/helpers.ts";
import {
  aesKdfParameters,
  argon2Parameters,
  buildKdbx,
  concat,
  field,
  INNER,
  UUID,
} from "./test/kdbx.ts";

// The fixtures: KeePassXC 2.7.6 (`keepassxc-cli import` of kdbx-source.xml, KDBX 4.1, AES-256,
// AES-KDF with the rounds of 100 ms, an attachment; once with a .keyx key file, once without the
// group tags, which KeePassXC then saves as KDBX 3.1), and from that database pykeepass 4.2 with
// cheap KDFs (Argon2d/id with 1 MiB and 2 passes, AES-KDF with 1000 rounds), each opened again
// with keepassxc-cli; how is in test/generate-kdbx.py.
const PASSWORD = "Weber-Haustechnik-2026";
const open = (name: string, password = PASSWORD, keyFile?: string) =>
  openKdbx(fixture(name), { password, keyFile: keyFile ? fixture(keyFile) : undefined });

const WEBER = [
  {
    type: "login",
    title: "Online-Banking Sparkasse",
    fields: [
      ["username", "Username", "jonas.weber", "text"],
      ["password", "Password", "Sp@rkasse<2026>!", "secret"],
      ["website", "Website", "https://banking.sparkasse.example", "url"],
      [
        "totp",
        "One-time code",
        "otpauth://totp/Sparkasse:jonas.weber?secret=JBSWY3DPEHPK3PXP",
        "totp",
      ],
      ["field-1", "Kundennummer", "7788-1", "text"],
      ["field-2", "Online-PIN", "90210", "secret"],
      ["note", "Notes", 'TAN per App\nKontakt: Filiale "Mitte" & Online', "note"],
    ],
    tags: ["Bank", "Büro"],
    history: [["password", "Sp@rkasse-2025!", 1762157700000]],
  },
  {
    type: "login",
    title: "DATEV Unternehmen online",
    fields: [
      ["username", "Username", "anna.weber@weber-haustechnik.example", "text"],
      ["password", "Password", "Bilanz#2026-Anna", "secret"],
      ["website", "Website", "https://duo.datev.example", "url"],
    ],
    folders: ["Büro"],
  },
  {
    type: "login",
    title: "Lohnbüro Sandra",
    fields: [
      ["username", "Username", "sandra.koch", "text"],
      ["password", "Password", "Lohn€Sandra👷", "secret"],
    ],
    folders: ["Büro"],
  },
  {
    type: "login",
    title: "Wärmepumpen-Portal",
    fields: [
      ["username", "Username", "max@weber-haustechnik.example", "text"],
      ["password", "Password", "Wärme&Pumpe-77", "secret"],
      ["website", "Website", "https://portal.waermepumpe.example", "url"],
    ],
    folders: ["Technik/Fernwartung"],
  },
];

describe("KDBX 4 (K-502 Teil 3)", () => {
  it.each([
    ["Argon2d, AES-256", "kdbx-argon2d-aes.kdbx"],
    ["Argon2id, ChaCha20", "kdbx-argon2id-chacha20.kdbx"],
    ["AES-KDF, AES-256, uncompressed, Salsa20 inner stream", "kdbx-aeskdf-aes.kdbx"],
  ])("reads %s: groups, protected values in order, history, the bin left out", async (_, name) => {
    expect(compact(await open(name))).toEqual(WEBER);
  });

  it.each([
    ["XML v1", "kdbx-keyfile-v1.kdbx", PASSWORD, "kdbx-key-v1.key"],
    ["32 raw bytes, no password", "kdbx-keyfile-raw.kdbx", "", "kdbx-key-raw.key"],
    ["64 hex characters, no password", "kdbx-keyfile-hex.kdbx", "", "kdbx-key-hex.key"],
    ["any other file", "kdbx-keyfile-any.kdbx", PASSWORD, "kdbx-key-any.key"],
  ])("opens with a key file: %s", async (_, name, password, keyFile) => {
    expect(compact(await open(name, password, keyFile))).toEqual(WEBER);
  });

  it("refuses a wrong password or a missing or wrong key file", async () => {
    const wrong = { ok: false, error: "wrong-key" };
    expect(await open("kdbx-argon2d-aes.kdbx", "weber-haustechnik-2026")).toEqual(wrong);
    expect(await open("kdbx-argon2d-aes.kdbx", "")).toEqual(wrong);
    expect(await open("kdbx-keyfile-any.kdbx")).toEqual(wrong);
    expect(await open("kdbx-keyfile-any.kdbx", PASSWORD, "kdbx-key-hex.key")).toEqual(wrong);
    expect(await open("kdbx-keyfile-raw.kdbx", "x", "kdbx-key-raw.key")).toEqual(wrong);
  });

  it("tries an empty password as a part too when a key file comes without one", async () => {
    const keyFile = new Uint8Array(32).fill(9);
    const router = [
      {
        type: "login",
        title: "Router Lager",
        fields: [["password", "Password", "Lager&Router-2026", "secret"]],
      },
    ];
    const withEmpty = buildKdbx({ password: "", keyFile }).bytes;
    const without = buildKdbx({ password: null, keyFile }).bytes;
    expect(compact(await openKdbx(withEmpty, { password: "", keyFile }))).toEqual(router);
    expect(compact(await openKdbx(without, { password: "", keyFile }))).toEqual(router);
    expect(compact(await openKdbx(buildKdbx({ password: "" }).bytes, { password: "" }))).toEqual(
      router,
    );
    expect(await openKdbx(without, { password: "" })).toEqual({ ok: false, error: "wrong-key" });
  });

  it("refuses a broken key file before deriving anything", async () => {
    const keyFile = new TextEncoder().encode(
      "<KeyFile><Meta><Version>3.0</Version></Meta><Key><Data>00</Data></Key></KeyFile>",
    );
    expect(await openKdbx(buildKdbx().bytes, { password: "Weber", keyFile })).toEqual({
      ok: false,
      error: "bad-key-file",
    });
  });

  it("refuses changed bytes in the header, its SHA-256 and the blocks", async () => {
    const bytes = fixture("kdbx-argon2id-chacha20.kdbx");
    const header = readKdbxHeader(bytes);
    const end = header.ok ? header.value.end : 0;
    const changed = (at: number) => {
      const copy = bytes.slice();
      copy[at] = (copy[at] as number) ^ 1;
      return openKdbx(copy, { password: PASSWORD });
    };
    const bad = { ok: false, error: "bad-kdbx" };
    expect(await changed(end - 40)).toEqual(bad);
    expect(await changed(end)).toEqual(bad);
    expect(await changed(end + 64 + 36 + 5)).toEqual(bad);
    expect(await changed(bytes.length - 36)).toEqual(bad);
    expect(await openKdbx(bytes.subarray(0, -1), { password: PASSWORD })).toEqual(bad);
    // The header's HMAC is what tells a wrong key, so a change there reads as one
    expect(await changed(end + 32)).toEqual({ ok: false, error: "wrong-key" });
  });

  it("calls a header that was changed together with its SHA-256 a wrong key", async () => {
    const built = buildKdbx();
    const changed = built.bytes.slice();
    changed[headerEndOf(built) - 1] = 0x0b;
    const header = changed.subarray(0, headerEndOf(built));
    changed.set(await sha256(header), headerEndOf(built));
    expect(await openKdbx(changed, { password: "Weber" })).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });

  it("calls a cut header a broken database and a cut checksum too", async () => {
    const built = buildKdbx();
    const at = headerEndOf(built);
    for (const length of [at - 1, at + 31, at + 63]) {
      expect(await openKdbx(built.bytes.subarray(0, length), { password: "Weber" })).toEqual({
        ok: false,
        error: "bad-kdbx",
      });
    }
  });

  it("refuses KDBX 3.1, KeePass 1 and files that are no KeePass database", async () => {
    expect(await open("keepassxc-3.1.kdbx")).toEqual({ ok: false, error: "unsupported" });
    expect(await open("keepass.xml")).toEqual({ ok: false, error: "wrong-format" });
  });

  it("refuses a KDF that costs more than the limits", async () => {
    const costly = (kdf: Uint8Array) =>
      openKdbx(
        buildKdbx({
          fields: (d) => [d.cipher, d.compression, d.masterSeed, d.iv, field(11, kdf), d.end],
        }).bytes,
        { password: "Weber" },
      );
    const tooCostly = { ok: false, error: "too-costly" };
    expect(await costly(argon2Parameters({ memory: 1024n ** 3n + 1024n }))).toEqual(tooCostly);
    expect(await costly(argon2Parameters({ iterations: 101n }))).toEqual(tooCostly);
    // 128 MiB times 65 passes is more work than 8 GiB, each part within its limit
    expect(await costly(argon2Parameters({ memory: 128n * 1024n ** 2n, iterations: 65n }))).toEqual(
      tooCostly,
    );
    expect(await costly(aesKdfParameters(100_000_001n))).toEqual(tooCostly);
    // noble's Argon2 slows with many lanes: 1 GiB in 131 072 lanes takes a minute a pass, so
    // 8 passes within the work limit would take eight
    expect(
      await costly(argon2Parameters({ memory: 1024n ** 3n, iterations: 8n, parallelism: 131_072 })),
    ).toEqual(tooCostly);
    expect(await costly(argon2Parameters({ parallelism: 257 }))).toEqual(tooCostly);
  });

  it("sets the limits as documented", () => {
    expect(KDBX_LIMITS).toEqual({
      memoryKiB: 1024 * 1024,
      iterations: 100,
      work: 8 * 1024 * 1024,
      parallelism: 256,
      aesRounds: 100_000_000,
      bytes: 64 * 1024 * 1024,
    });
  });

  it("keeps to the limits exactly at their edges", async () => {
    const built = buildKdbx({
      fields: (d) => [
        d.cipher,
        d.compression,
        d.masterSeed,
        d.iv,
        field(11, argon2Parameters({ memory: 8n * 1024n, iterations: 2n })),
        d.end,
      ],
    });
    const limits = { ...KDBX_LIMITS, memoryKiB: 8, iterations: 2, work: 16, parallelism: 1 };
    // The password is wrong, so getting to the key's check means the limits let it through
    expect(await openKdbx(built.bytes, { password: "x" }, limits)).toEqual({
      ok: false,
      error: "wrong-key",
    });
    for (const tighter of [{ memoryKiB: 7 }, { iterations: 1 }, { work: 15 }, { parallelism: 0 }]) {
      expect(await openKdbx(built.bytes, { password: "x" }, { ...limits, ...tighter })).toEqual({
        ok: false,
        error: "too-costly",
      });
    }
    const aes = buildKdbx({
      fields: (d) => [
        d.cipher,
        d.compression,
        d.masterSeed,
        d.iv,
        field(11, aesKdfParameters(3n)),
        d.end,
      ],
    });
    const aesLimits = (aesRounds: number) => ({ ...KDBX_LIMITS, aesRounds });
    expect(await openKdbx(aes.bytes, { password: "x" }, aesLimits(3))).toEqual({
      ok: false,
      error: "wrong-key",
    });
    expect(await openKdbx(aes.bytes, { password: "x" }, aesLimits(2))).toEqual({
      ok: false,
      error: "too-costly",
    });
  });

  it("refuses a payload larger than the limit, packed or not", async () => {
    const plain = buildKdbx({ compress: false });
    const packed = buildKdbx();
    const limits = (bytes: number) => ({ ...KDBX_LIMITS, bytes });
    const key = { password: "Weber" };
    const tooLarge = { ok: false, error: "too-large" };
    expect((await openKdbx(plain.bytes, key, limits(plain.payloadLength))).ok).toBe(true);
    expect(await openKdbx(plain.bytes, key, limits(plain.payloadLength - 1))).toEqual(tooLarge);
    expect((await openKdbx(packed.bytes, key, limits(packed.payloadLength))).ok).toBe(true);
    expect(await openKdbx(packed.bytes, key, limits(packed.payloadLength - 1))).toEqual(tooLarge);
  });

  it("refuses a payload whose padding, gzip or inner header is broken", async () => {
    const key = { password: "Weber" };
    const bad = { ok: false, error: "bad-kdbx" };
    // A last block whose padding byte is 0, packed or not
    for (const compress of [true, false]) {
      const padding = buildKdbx({ compress, noPadding: true, encrypted: () => new Uint8Array(32) });
      expect(await openKdbx(padding.bytes, key)).toEqual(bad);
    }
    const gzip = buildKdbx({ compress: true, encrypted: (plain) => plain.subarray(0, 20) });
    expect(await openKdbx(gzip.bytes, key)).toEqual(bad);
    const inner = buildKdbx({ inner: field(1, Uint8Array.of(1, 0, 0, 0)) });
    expect(await openKdbx(inner.bytes, key)).toEqual({ ok: false, error: "unsupported" });
    const notText = buildKdbx({ payload: concat(INNER, Uint8Array.of(0xff, 0xfe, 0x3c)) });
    expect(await openKdbx(notText.bytes, key)).toEqual(bad);
    const notXml = buildKdbx({ xml: () => "<KeePassFile>" });
    expect(await openKdbx(notXml.bytes, key)).toEqual(bad);
    const badValue = buildKdbx({
      xml: () =>
        '<KeePassFile><Root><Group><Value Protected="True">*</Value></Group></Root></KeePassFile>',
    });
    expect(await openKdbx(badValue.bytes, key)).toEqual(bad);
    const otherXml = buildKdbx({ xml: () => "<Other/>" });
    expect(await openKdbx(otherXml.bytes, key)).toEqual({ ok: false, error: "wrong-format" });
  });

  it("reads a ChaCha20 database in several blocks", async () => {
    const built = buildKdbx({ cipher: "chacha20", compress: false, blockSize: 7 });
    const result = await openKdbx(built.bytes, { password: "Weber" });
    expect(result.ok && result.value.map((e) => e.content.title)).toEqual(["Router Lager"]);
  });

  it("refuses a KDF parameter that Argon2 refuses as a broken database", async () => {
    // 8 KiB is the least KeePassXC takes, but four lanes need 32 KiB
    const kdf = argon2Parameters({ memory: 8n * 1024n }).slice();
    const lanes = concat(new TextEncoder().encode("P"));
    const at = indexOf(kdf, lanes) + 1 + 4;
    kdf[at] = 4;
    const built = buildKdbx({
      fields: (d) => [d.cipher, d.compression, d.masterSeed, d.iv, field(11, kdf), d.end],
    });
    expect(await openKdbx(built.bytes, { password: "Weber" })).toEqual({
      ok: false,
      error: "bad-kdbx",
    });
  });

  it("opens with unlockKdbx and the default limits", async () => {
    expect(
      compact(await unlockKdbx(fixture("kdbx-argon2d-aes.kdbx"), { password: PASSWORD })),
    ).toEqual(WEBER);
  });

  it("without the key only says whether the file is a database it can open", () => {
    expect(checkKdbx(fixture("kdbx-argon2d-aes.kdbx"))).toEqual({ ok: false, error: "encrypted" });
    expect(checkKdbx(fixture("keepassxc-3.1.kdbx"))).toEqual({ ok: false, error: "unsupported" });
    expect(checkKdbx(fixture("keepass.xml"))).toEqual({ ok: false, error: "wrong-format" });
    const built = buildKdbx();
    expect(checkKdbx(built.bytes.subarray(0, built.headerEnd + 64))).toEqual({
      ok: false,
      error: "encrypted",
    });
    const costly = buildKdbx({
      fields: (d) => [
        d.cipher,
        d.compression,
        d.masterSeed,
        d.iv,
        field(11, aesKdfParameters(100_000_001n)),
        d.end,
      ],
    });
    expect(checkKdbx(costly.bytes)).toEqual({ ok: false, error: "too-costly" });
  });

  it("reads twofish as unsupported", () => {
    const built = buildKdbx({
      fields: (d) => [field(2, UUID.twofish), d.compression, d.masterSeed, d.iv, d.kdf, d.end],
    });
    expect(checkKdbx(built.bytes)).toEqual({ ok: false, error: "unsupported" });
  });
});

// Last, as AES-KDF with the rounds KeePassXC measured for 100 ms takes seconds in JavaScript
describe("KDBX 4 from KeePassXC 2.7.6", () => {
  it("reads a database with an attachment, which takes nothing from the inner stream", async () => {
    expect(compact(await open("keepassxc.kdbx"))).toEqual(WEBER);
  }, 30_000);

  it("reads a database with password and .keyx key file", async () => {
    expect(
      compact(await open("keepassxc-keyfile.kdbx", PASSWORD, "keepassxc-keyfile.keyx")),
    ).toEqual(WEBER);
  }, 30_000);
});

describe("gunzip", () => {
  it("unpacks and stops past the limit", async () => {
    const { gzipSync } = await import("node:zlib");
    const packed = new Uint8Array(gzipSync(new Uint8Array(1000).fill(7)));
    const out = await gunzip(packed, 1000);
    expect(out.ok && out.value).toEqual(new Uint8Array(1000).fill(7));
    expect(await gunzip(packed, 999)).toEqual({ ok: false, error: "too-large" });
    expect(await gunzip(new Uint8Array(0), 10)).toEqual({ ok: false, error: "bad-kdbx" });
    expect(await gunzip(Uint8Array.of(1, 2, 3), 10)).toEqual({ ok: false, error: "bad-kdbx" });
  });

  it("stops past the limit without a stray rejection when junk follows the gzip data", async () => {
    // Node 24's DecompressionStream rejects a cancel when junk follows the stream's end
    // (ERR_TRAILING_JUNK_AFTER_STREAM_END); left unhandled, that would crash a server
    const { gzipSync } = await import("node:zlib");
    const packed = new Uint8Array([...gzipSync(new Uint8Array(1000).fill(7)), 1, 2, 3]);
    const stray: unknown[] = [];
    const listener = (reason: unknown) => stray.push(reason);
    process.on("unhandledRejection", listener);
    try {
      // Which error comes first is zlib's: Node 24 hands out the 1000 bytes before it reports the
      // junk (too-large), Node 22 reads the junk as a broken second gzip member and fails before
      // any output (Z_DATA_ERROR, bad-kdbx). The data stays this small so that on Node 24 the
      // output and the junk land in one zlib call, the case where a cancel rejected
      const result = await gunzip(packed, 1);
      expect(result.ok ? "ok" : result.error).toMatch(/^(too-large|bad-kdbx)$/);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      process.off("unhandledRejection", listener);
    }
    expect(stray).toEqual([]);
  });
});

/** Where the header ends in a built database: right before its SHA-256 */
const headerEndOf = (built: { headerEnd: number }) => built.headerEnd;
const sha256 = async (data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>));
const indexOf = (haystack: Uint8Array, needle: Uint8Array) =>
  Buffer.from(haystack).indexOf(Buffer.from(needle));
