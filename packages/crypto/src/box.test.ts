import { describe, expect, it } from "vitest";
import { BOX_V1, KEY_LENGTH, NONCE_LENGTH, open, seal, sealWithNonce } from "./box.ts";

const key = new Uint8Array(KEY_LENGTH).fill(7);
const where = { purpose: "entry", context: ["vault-1", "entry-1", 3] };
const message = new TextEncoder().encode("Weber-2026!");

describe("seal", () => {
  it("writes version 1, a 24-byte nonce and a 16-byte tag around the ciphertext", () => {
    const box = seal(key, message, where);
    expect(box[0]).toBe(BOX_V1);
    expect(box.length).toBe(1 + NONCE_LENGTH + message.length + 16);
  });

  it("draws a fresh nonce for every box", () => {
    const nonces = new Set(
      Array.from({ length: 50 }, () =>
        Buffer.from(seal(key, message, where).subarray(1, 25)).toString("hex"),
      ),
    );
    expect(nonces.size).toBe(50);
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => seal(new Uint8Array(31), message, where)).toThrow("key must be 32 bytes");
  });

  it("refuses a nonce that is not 24 bytes", () => {
    expect(() => sealWithNonce(key, new Uint8Array(12), message, where)).toThrow(
      "nonce must be 24 bytes",
    );
  });
});

describe("open", () => {
  it("refuses a purpose with a lone surrogate instead of reading it as U+FFFD", () => {
    const box = seal(key, message, { purpose: "a\uFFFD", context: [] });
    expect(open(key, box, { purpose: "a\uD800", context: [] }).ok).toBe(false);
    expect(() => seal(key, message, { purpose: "a\uD800", context: [] })).toThrow(
      "not well-formed text",
    );
  });

  const box = seal(key, message, where);

  it("returns the plaintext of a box sealed with the same key and place", () => {
    expect(open(key, box, where)).toEqual({ ok: true, value: message });
  });

  it("refuses a box of another version instead of reading it differently", () => {
    const other = box.slice();
    other[0] = 0x02;
    expect(open(key, other, where)).toEqual({ ok: false, error: "unknown-version" });
    other[0] = 0x00;
    expect(open(key, other, where)).toEqual({ ok: false, error: "unknown-version" });
  });

  it("refuses an empty box and one shorter than nonce and tag", () => {
    expect(open(key, new Uint8Array(), where)).toEqual({ ok: false, error: "too-short" });
    expect(open(key, box.subarray(0, 1 + NONCE_LENGTH + 15), where)).toEqual({
      ok: false,
      error: "too-short",
    });
  });

  it("opens a box of exactly nonce and tag (an empty plaintext)", () => {
    const empty = seal(key, new Uint8Array(), where);
    expect(empty.length).toBe(1 + NONCE_LENGTH + 16);
    expect(open(key, empty, where)).toEqual({ ok: true, value: new Uint8Array() });
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(open(key.subarray(1), box, where)).toEqual({ ok: false, error: "wrong-key-length" });
  });

  it("fails as not authentic for another purpose, another context or a changed byte", () => {
    const notAuthentic = { ok: false, error: "not-authentic" };
    expect(open(key, box, { ...where, purpose: "vault-key" })).toEqual(notAuthentic);
    expect(open(key, box, { ...where, context: ["vault-1", "entry-1", 2] })).toEqual(notAuthentic);
    const changed = box.slice();
    changed[30] = (changed[30] ?? 0) ^ 1;
    expect(open(key, changed, where)).toEqual(notAuthentic);
  });
});
