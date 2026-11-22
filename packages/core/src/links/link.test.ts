import { linkNeedsPassphrase, sealLinkWith } from "@kennwort/crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { encodeLinkContent, type LinkContent, linkContentOfText } from "./content.ts";
import { isLinkId, linkAddress, openLinkContent, readLinkSecret, sealLinkContent } from "./link.ts";
import { LINK_LIMITS } from "./wire.ts";

// K-601: a one-time link end to end, without the server
const content = linkContentOfText("Tür-Code Lager", "Nachricht", "4711");
const secret = new Uint8Array(32).fill(5);

const id = encodeBytes(new Uint8Array(16).fill(1));

const sealed = async (passphrase?: string) => {
  const made = await sealLinkContent(content, passphrase);
  if (!made.ok) throw new Error(made.error);
  return made.value;
};

describe("sealLinkContent and openLinkContent", () => {
  it("seal the content under a fresh secret and open it with that secret only", async () => {
    const a = await sealed();
    const b = await sealed();
    expect(a.secret.length).toBe(32);
    expect(encodeBytes(a.secret)).not.toBe(encodeBytes(b.secret));
    expect(linkNeedsPassphrase(a.ciphertext)).toBe(false);
    expect(await openLinkContent(a.ciphertext, a.secret)).toEqual({ ok: true, value: content });
    expect(await openLinkContent(a.ciphertext, b.secret)).toEqual({
      ok: false,
      error: "wrong-secret",
    });
  });

  it("puts nothing of the content in the ciphertext as plain text", async () => {
    const { ciphertext } = await sealed();
    const text = new TextDecoder("latin1").decode(ciphertext);
    for (const part of ["4711", "Lager", "Nachricht"]) expect(text).not.toContain(part);
  });

  it("with a passphrase: asks for it, and opens only with it", async () => {
    const made = await sealed("Kessel Rohr");
    expect(linkNeedsPassphrase(made.ciphertext)).toBe(true);
    expect(await openLinkContent(made.ciphertext, made.secret)).toEqual({
      ok: false,
      error: "needs-passphrase",
    });
    expect(await openLinkContent(made.ciphertext, made.secret, "Kessel Rohr")).toEqual({
      ok: true,
      value: content,
    });
  }, 30_000);

  it("answers a ciphertext that opens to anything but link content with damaged", async () => {
    const link = await sealedWith(secret, new TextEncoder().encode('{"version":2}'));
    expect(await openLinkContent(link, secret)).toEqual({ ok: false, error: "damaged" });
  });

  it("refuses content outside its own limits as too large, instead of throwing", async () => {
    const field = { label: "l", value: "v", secret: false };
    for (const over of [
      { ...content, fields: [] },
      { ...content, fields: Array.from({ length: 51 }, () => field) },
      { ...content, fields: [{ ...field, value: "v".repeat(20_001) }] },
    ])
      expect(await sealLinkContent(over)).toEqual({ ok: false, error: "too-large" });
  });

  it("pads the content to a multiple of 256 bytes, so the server learns its length only roughly", async () => {
    const text = (value: string) => linkContentOfText("", "", value);
    const json = (value: string) => encodeLinkContent(text(value)).length;
    const base = json("v") - 1;
    // F-15 without a passphrase adds 2 + 1 + 24 + 16 bytes to the padded plaintext
    for (const [length, padded] of [
      [1, 256],
      [256 - base, 256],
      [257 - base, 512],
      [512 - base, 512],
    ] as const) {
      const made = await sealLinkContent(text("v".repeat(length)));
      expect(made.ok && made.value.ciphertext.length).toBe(padded + 43);
    }
    const made = await sealLinkContent(text("v".repeat(257 - base)));
    if (!made.ok) throw new Error(made.error);
    expect(await openLinkContent(made.value.ciphertext, made.value.secret)).toEqual({
      ok: true,
      value: text("v".repeat(257 - base)),
    });
  });

  it("refuses content too large for the server, and seals what just fits", async () => {
    const fits = (title: string): LinkContent => ({
      version: 1,
      title,
      fields: Array.from({ length: 4 }, () => ({
        label: "",
        value: "v".repeat(16_272),
        secret: false,
      })),
    });
    // Four fields of 16 272 characters and a title of one encode to 65 280 bytes, 255 blocks of
    // 256; with the F-15 overhead of at most 59 (a passphrase's salt counted) that is 65 339, the
    // most below the server's limit of 65 536. One byte more pads to 65 536 and no longer fits.
    const size = (c: LinkContent) => encodeLinkContent(c).length;
    expect(size(fits("t"))).toBe(255 * 256);
    const just = await sealLinkContent(fits("t"));
    expect(just.ok && just.value.ciphertext.length).toBe(255 * 256 + 43);
    const guarded = await sealLinkContent(fits("t"), "x");
    expect(guarded.ok && guarded.value.ciphertext.length).toBe(255 * 256 + 59);
    expect(LINK_LIMITS.maxBytes).toBe(256 * 256);
    expect(await sealLinkContent(fits("tt"))).toEqual({ ok: false, error: "too-large" });
  }, 30_000);
});

const sealedWith = (s: Uint8Array, plaintext: Uint8Array) =>
  sealLinkWith({ m: 8, t: 1, p: 1 }, { secret: s, nonce: new Uint8Array(24), plaintext });

describe("linkAddress and readLinkSecret", () => {
  it("put the fetch ID into the path and the secret into the fragment only", () => {
    const address = linkAddress("https://kennwort.weber.de", id, secret);
    const url = new URL(address);
    expect(url.pathname).toBe(`/s/${id}`);
    expect(url.hash).toBe(`#${encodeBytes(secret)}`);
    expect(address).toBe(`https://kennwort.weber.de/s/${id}#${encodeBytes(secret)}`);
  });

  it("read the secret back from a fragment with or without #", () => {
    const hash = `#${encodeBytes(secret)}`;
    expect(readLinkSecret(hash)).toEqual(secret);
    expect(readLinkSecret(hash.slice(1))).toEqual(secret);
  });

  it("read nothing from a fragment that is not exactly 32 bytes of canonical base64url", () => {
    for (const hash of [
      "",
      "#",
      `#${encodeBytes(new Uint8Array(31))}`,
      `#${encodeBytes(new Uint8Array(33))}`,
      `#${encodeBytes(secret)}x`,
      `#${encodeBytes(secret).replace("F", "+")}`,
      `##${encodeBytes(secret)}`,
      `${encodeBytes(secret)}#`,
      `#token=${encodeBytes(secret)}`,
    ])
      expect(readLinkSecret(hash)).toBeUndefined();
  });

  it("round-trips any secret", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (s) => {
        const url = new URL(linkAddress("https://k.example", id, s));
        expect(readLinkSecret(url.hash)).toEqual(s);
      }),
    );
  });
});

describe("isLinkId", () => {
  it("takes 16 bytes of canonical base64url and nothing else", () => {
    expect(isLinkId(id)).toBe(true);
    expect(isLinkId(encodeBytes(new Uint8Array(16).fill(0xff)))).toBe(true);
    for (const other of [
      "",
      id.slice(1),
      `${id}A`,
      `${id.slice(0, 21)}B`,
      `${id.slice(0, 21)}+`,
      "../../api/links",
      `${id}/x`,
    ])
      expect(isLinkId(other)).toBe(false);
  });
});
