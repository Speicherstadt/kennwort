import { argon2id } from "@noble/hashes/argon2.js";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/export-v1.json" with { type: "json" };
import { open } from "./box.ts";
import { kdf } from "./derive.ts";
import {
  EXPORT_ARGON2_V1,
  EXPORT_SALT_LENGTH,
  EXPORT_V1,
  openExport,
  openExportWith,
  sealExport,
  sealExportWith,
} from "./export-file.ts";
import { fromHex, hex } from "./test-helpers.ts";

// F-13: Kennwort's own encrypted export (K-504), vectors from node:crypto and libsodium
describe.each(vectors)("F-13 vector: $name (node:crypto, libsodium)", (vector) => {
  const salt = fromHex(vector.salt);
  const nonce = fromHex(vector.nonce);
  const plaintext = fromHex(vector.plaintext);

  it("seals to the same file and opens it again", async () => {
    const file = await sealExportWith(EXPORT_ARGON2_V1, vector.passphrase, salt, nonce, plaintext);
    expect(hex(file)).toBe(vector.file);
    expect(await openExport(vector.passphrase, fromHex(vector.file))).toEqual({
      ok: true,
      value: plaintext,
    });
  }, 30_000);

  it("is an F-01 box under the vector's key, bound to the salt", () => {
    const box = fromHex(vector.file).subarray(1 + EXPORT_SALT_LENGTH);
    expect(open(fromHex(vector.key), box, { purpose: "export", context: [salt] })).toEqual({
      ok: true,
      value: plaintext,
    });
  });
});

const cheap = { m: 8, t: 1, p: 1 };
const salt = new Uint8Array(16).fill(7);
const nonce = new Uint8Array(24).fill(9);
const text = new TextEncoder().encode("Weber Haustechnik");

describe("sealExportWith", () => {
  it("fixes Argon2id at 64 MiB, three passes and one lane in version 1", () => {
    expect(EXPORT_ARGON2_V1).toEqual({ m: 65536, t: 3, p: 1 });
    expect(Object.isFrozen(EXPORT_ARGON2_V1)).toBe(true);
    expect([EXPORT_V1, EXPORT_SALT_LENGTH]).toEqual([1, 16]);
  });

  it("derives the key from Argon2id of the passphrase in NFKC, then HKDF", async () => {
    const file = await sealExportWith(cheap, "ﬁx", salt, nonce, text);
    const p1 = argon2id("fix", salt, { ...cheap, dkLen: 32 });
    const key = kdf(p1, new Uint8Array(), "kennwort/export/v1");
    expect(open(key, file.subarray(17), { purpose: "export", context: [salt] }).ok).toBe(true);
    expect(file[0]).toBe(1);
    expect(hex(file.subarray(1, 17))).toBe(hex(salt));
    expect(file.length).toBe(1 + 16 + 1 + 24 + text.length + 16);
  });

  it("refuses a salt of another length, an empty passphrase and a lone surrogate", async () => {
    await expect(sealExportWith(cheap, "x", new Uint8Array(15), nonce, text)).rejects.toThrow(
      "export salt must be 16 bytes",
    );
    await expect(sealExportWith(cheap, "x", new Uint8Array(17), nonce, text)).rejects.toThrow(
      RangeError,
    );
    await expect(sealExportWith(cheap, "", salt, nonce, text)).rejects.toThrow(
      "export passphrase must not be empty",
    );
    await expect(sealExportWith(cheap, "a\uD800", salt, nonce, text)).rejects.toThrow(
      "not well-formed text",
    );
  });
});

describe("openExportWith", () => {
  const sealed = () => sealExportWith(cheap, "Kessel", salt, nonce, text);

  it("opens with the passphrase in any normal form, and only with it", async () => {
    const file = await sealExportWith(cheap, "Bäcker", salt, nonce, text);
    expect(await openExportWith(cheap, "Bäcker".normalize("NFD"), file)).toEqual({
      ok: true,
      value: text,
    });
    expect(await openExportWith(cheap, "bäcker", file)).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(await openExportWith(cheap, "a\uDC00", file)).toEqual({
      ok: false,
      error: "wrong-passphrase",
    }); // A lone surrogate would turn into U+FFFD: it must not open what U+FFFD sealed
    const replaced = await sealExportWith(cheap, "a\uFFFD", salt, nonce, text);
    expect((await openExportWith(cheap, "a\uFFFD", replaced)).ok).toBe(true);
    expect(await openExportWith(cheap, "a\uD800", replaced)).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
  });

  it("refuses an empty file, another version and a file too short for a box", async () => {
    const file = await sealed();
    expect(await openExportWith(cheap, "Kessel", new Uint8Array())).toEqual({
      ok: false,
      error: "too-short",
    });
    for (const version of [0, 2, 0xff]) {
      const other = file.slice();
      other[0] = version;
      expect(await openExportWith(cheap, "Kessel", other)).toEqual({
        ok: false,
        error: "unknown-version",
      });
    }
    // 1 + 16 + 1 + 24 + 16 bytes is the shortest export: an empty plaintext
    const empty = await sealExportWith(cheap, "Kessel", salt, nonce, new Uint8Array());
    expect(empty.length).toBe(58);
    expect(await openExportWith(cheap, "Kessel", empty)).toEqual({
      ok: true,
      value: new Uint8Array(),
    });
    expect(await openExportWith(cheap, "Kessel", empty.subarray(0, 57))).toEqual({
      ok: false,
      error: "too-short",
    });
  });

  it("refuses a changed salt, nonce, ciphertext or tag", async () => {
    const file = await sealed();
    for (const at of [1, 16, 17, 18, 41, 42, file.length - 1]) {
      const changed = file.slice();
      changed[at] = (changed[at] as number) ^ 1;
      expect(await openExportWith(cheap, "Kessel", changed)).toEqual({
        ok: false,
        error: "wrong-passphrase",
      });
    }
  });

  it("does not open under other Argon2id parameters", async () => {
    const file = await sealed();
    expect((await openExportWith({ m: 16, t: 1, p: 1 }, "Kessel", file)).ok).toBe(false);
  });
});

describe("sealExport and openExport", () => {
  it("seal with a fresh salt and nonce each time and open with the v1 parameters", async () => {
    const [a, b] = await Promise.all([sealExport("Kessel", text), sealExport("Kessel", text)]);
    expect(hex(a.subarray(1, 17))).not.toBe(hex(b.subarray(1, 17)));
    expect(hex(a.subarray(18, 42))).not.toBe(hex(b.subarray(18, 42)));
    expect(await openExport("Kessel", a)).toEqual({ ok: true, value: text });
    expect((await openExportWith(cheap, "Kessel", a)).ok).toBe(false);
  }, 30_000);
});
