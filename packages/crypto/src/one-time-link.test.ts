import { argon2id } from "@noble/hashes/argon2.js";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/one-time-link-v1.json" with { type: "json" };
import { open } from "./box.ts";
import { kdf } from "./derive.ts";
import {
  LINK_ARGON2_V1,
  LINK_SALT_LENGTH,
  LINK_SECRET_LENGTH,
  LINK_V1,
  linkNeedsPassphrase,
  openLink,
  openLinkWith,
  sealLink,
  sealLinkWith,
} from "./one-time-link.ts";
import { fromHex, hex } from "./test-helpers.ts";

// F-15: the ciphertext of a one-time link (K-601), vectors from node:crypto and libsodium
describe.each(vectors)("F-15 vector: $name (node:crypto, libsodium)", (vector) => {
  const secret = fromHex(vector.secret);
  const nonce = fromHex(vector.nonce);
  const plaintext = fromHex(vector.plaintext);
  const salt = vector.salt === undefined ? undefined : fromHex(vector.salt);
  const passphrase =
    salt && vector.passphrase !== undefined ? { text: vector.passphrase, salt } : undefined;

  it("seals to the same link and opens it again", async () => {
    const link = await sealLinkWith(LINK_ARGON2_V1, { secret, nonce, plaintext, passphrase });
    expect(hex(link)).toBe(vector.link);
    expect(await openLink(secret, fromHex(vector.link), vector.passphrase)).toEqual({
      ok: true,
      value: plaintext,
    });
  }, 30_000);

  it("is an F-01 box under the vector's key, bound to the kind and salt", () => {
    const start = salt ? 2 + LINK_SALT_LENGTH : 2;
    const context = salt ? [Uint8Array.of(1), salt] : [Uint8Array.of(0)];
    const box = fromHex(vector.link).subarray(start);
    expect(open(fromHex(vector.key), box, { purpose: "link", context })).toEqual({
      ok: true,
      value: plaintext,
    });
  });
});

const cheap = { m: 8, t: 1, p: 1 };
const secret = new Uint8Array(32).fill(3);
const salt = new Uint8Array(16).fill(7);
const nonce = new Uint8Array(24).fill(9);
const text = new TextEncoder().encode("Tür-Code Lager: 4711");
const plain = () => sealLinkWith(cheap, { secret, nonce, plaintext: text });
const guarded = (passphrase = "Kessel") =>
  sealLinkWith(cheap, { secret, nonce, plaintext: text, passphrase: { text: passphrase, salt } });

describe("sealLinkWith", () => {
  it("fixes version 1, a 32-byte secret, a 16-byte salt and Argon2id at 64 MiB, t = 3, p = 1", () => {
    expect([LINK_V1, LINK_SECRET_LENGTH, LINK_SALT_LENGTH]).toEqual([1, 32, 16]);
    expect(LINK_ARGON2_V1).toEqual({ m: 65536, t: 3, p: 1 });
    expect(Object.isFrozen(LINK_ARGON2_V1)).toBe(true);
  });

  it("without a passphrase: version, kind 0 and a box under HKDF of the secret", async () => {
    const link = await plain();
    expect([...link.subarray(0, 2)]).toEqual([1, 0]);
    expect(link.length).toBe(2 + 1 + 24 + text.length + 16);
    const key = kdf(secret, new Uint8Array(), "kennwort/link/v1", Uint8Array.of(0));
    expect(open(key, link.subarray(2), { purpose: "link", context: [Uint8Array.of(0)] })).toEqual({
      ok: true,
      value: text,
    });
  });

  it("with a passphrase: kind 1, the salt, and Argon2id of the passphrase in NFKC as HKDF salt", async () => {
    const link = await guarded("ﬁx");
    expect([...link.subarray(0, 2)]).toEqual([1, 1]);
    expect(hex(link.subarray(2, 18))).toBe(hex(salt));
    expect(link.length).toBe(2 + 16 + 1 + 24 + text.length + 16);
    const p1 = argon2id("fix", salt, { ...cheap, dkLen: 32 });
    const key = kdf(secret, p1, "kennwort/link/v1", Uint8Array.of(1), salt);
    const where = { purpose: "link", context: [Uint8Array.of(1), salt] };
    expect(open(key, link.subarray(18), where)).toEqual({ ok: true, value: text });
  });

  it("refuses a secret or salt of another length, an empty passphrase and a lone surrogate", async () => {
    for (const length of [31, 33])
      await expect(
        sealLinkWith(cheap, { secret: new Uint8Array(length), nonce, plaintext: text }),
      ).rejects.toThrow("link secret must be 32 bytes");
    for (const length of [15, 17])
      await expect(
        sealLinkWith(cheap, {
          secret,
          nonce,
          plaintext: text,
          passphrase: { text: "x", salt: new Uint8Array(length) },
        }),
      ).rejects.toThrow("link salt must be 16 bytes");
    await expect(guarded("")).rejects.toThrow("link passphrase must not be empty");
    await expect(guarded("a\uD800")).rejects.toThrow("not well-formed text");
  });
});

describe("openLinkWith", () => {
  it("opens a link without a passphrase with its secret only, and ignores a passphrase given", async () => {
    const link = await plain();
    expect(await openLinkWith(cheap, secret, link)).toEqual({ ok: true, value: text });
    expect(await openLinkWith(cheap, secret, link, "egal\uD800")).toEqual({
      ok: true,
      value: text,
    });
    expect(linkNeedsPassphrase(link)).toBe(false);
  });

  it("asks for the passphrase of a protected link and opens it in any normal form", async () => {
    const link = await guarded("Bäcker");
    expect(linkNeedsPassphrase(link)).toBe(true);
    expect(await openLinkWith(cheap, secret, link)).toEqual({
      ok: false,
      error: "needs-passphrase",
    });
    expect(await openLinkWith(cheap, secret, link, "Bäcker".normalize("NFD"))).toEqual({
      ok: true,
      value: text,
    });
    for (const wrong of ["bäcker", "", "a\uD800"])
      expect(await openLinkWith(cheap, secret, link, wrong)).toEqual({
        ok: false,
        error: "wrong-secret",
      });
    // A lone surrogate would turn into U+FFFD: it must not open what U+FFFD sealed
    const replaced = await guarded("a�");
    expect((await openLinkWith(cheap, secret, replaced, "a�")).ok).toBe(true);
    expect((await openLinkWith(cheap, secret, replaced, "a\uDC00")).ok).toBe(false);
  });

  it("fails with another secret, also one of another length", async () => {
    const link = await plain();
    for (const other of [new Uint8Array(32).fill(4), secret.subarray(0, 31), new Uint8Array(0)])
      expect(await openLinkWith(cheap, other, link)).toEqual({ ok: false, error: "wrong-secret" });
  });

  it("refuses empty bytes, another version, an unknown kind and a link too short for a box", async () => {
    expect(await openLinkWith(cheap, secret, new Uint8Array())).toEqual({
      ok: false,
      error: "too-short",
    });
    expect(await openLinkWith(cheap, secret, Uint8Array.of(1))).toEqual({
      ok: false,
      error: "too-short",
    });
    const link = await plain();
    for (const version of [0, 2, 0xff]) {
      const other = link.slice();
      other[0] = version;
      expect(await openLinkWith(cheap, secret, other)).toEqual({
        ok: false,
        error: "unknown-version",
      });
      expect(linkNeedsPassphrase(other)).toBeUndefined();
    }
    for (const kind of [2, 0xff]) {
      const other = link.slice();
      other[1] = kind;
      expect(await openLinkWith(cheap, secret, other)).toEqual({
        ok: false,
        error: "unknown-kind",
      });
    }
    // The shortest links: an empty plaintext, 2 + 41 bytes, or 2 + 16 + 41 with a passphrase
    const empty = await sealLinkWith(cheap, { secret, nonce, plaintext: new Uint8Array() });
    expect(empty.length).toBe(43);
    expect((await openLinkWith(cheap, secret, empty)).ok).toBe(true);
    expect(await openLinkWith(cheap, secret, empty.subarray(0, 42))).toEqual({
      ok: false,
      error: "too-short",
    });
    const emptyGuarded = await sealLinkWith(cheap, {
      secret,
      nonce,
      plaintext: new Uint8Array(),
      passphrase: { text: "x", salt },
    });
    expect(emptyGuarded.length).toBe(59);
    expect((await openLinkWith(cheap, secret, emptyGuarded, "x")).ok).toBe(true);
    expect(await openLinkWith(cheap, secret, emptyGuarded.subarray(0, 58), "x")).toEqual({
      ok: false,
      error: "too-short",
    });
    expect(linkNeedsPassphrase(emptyGuarded.subarray(0, 58))).toBeUndefined();
  });

  it("refuses a server that strips or adds the passphrase flag", async () => {
    const link = await guarded();
    // Kind 0 with the rest as it was: the salt now reads as part of the box
    const stripped = Uint8Array.of(1, 0, ...link.subarray(18));
    expect(await openLinkWith(cheap, secret, stripped)).toEqual({
      ok: false,
      error: "wrong-secret",
    });
    const plainLink = await plain();
    const added = Uint8Array.of(1, 1, ...salt, ...plainLink.subarray(2));
    expect(await openLinkWith(cheap, secret, added, "Kessel")).toEqual({
      ok: false,
      error: "wrong-secret",
    });
  });

  it("refuses a changed salt, nonce, ciphertext or tag", async () => {
    const link = await guarded();
    for (const at of [2, 17, 18, 19, 42, 43, link.length - 1]) {
      const changed = link.slice();
      changed[at] = (changed[at] as number) ^ 1;
      expect(await openLinkWith(cheap, secret, changed, "Kessel")).toEqual({
        ok: false,
        error: "wrong-secret",
      });
    }
  });

  it("does not open under other Argon2id parameters", async () => {
    const link = await guarded();
    expect((await openLinkWith({ m: 16, t: 1, p: 1 }, secret, link, "Kessel")).ok).toBe(false);
  });
});

describe("sealLink and openLink", () => {
  it("draw a fresh secret and nonce each time; without a passphrase no Argon2id runs", async () => {
    const [a, b] = await Promise.all([sealLink(text), sealLink(text)]);
    expect(a.secret.length).toBe(32);
    expect(hex(a.secret)).not.toBe(hex(b.secret));
    expect(hex(a.link.subarray(3, 27))).not.toBe(hex(b.link.subarray(3, 27)));
    expect(await openLink(a.secret, a.link)).toEqual({ ok: true, value: text });
    expect((await openLink(b.secret, a.link)).ok).toBe(false);
  });

  it("with a passphrase: a fresh salt, and the v1 parameters to open", async () => {
    const [a, b] = await Promise.all([sealLink(text, "Kessel"), sealLink(text, "Kessel")]);
    expect(hex(a.link.subarray(2, 18))).not.toBe(hex(b.link.subarray(2, 18)));
    expect(await openLink(a.secret, a.link, "Kessel")).toEqual({ ok: true, value: text });
    expect((await openLinkWith(cheap, a.secret, a.link, "Kessel")).ok).toBe(false);
  }, 30_000);
});
