import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encode } from "./encoding.ts";
import { bundleFingerprint, recoveryFingerprint, rootFingerprint } from "./fingerprint.ts";
import { hex } from "./test-helpers.ts";
import {
  unwrap,
  WRAP_V1,
  wrap,
  XWING_CIPHERTEXT_LENGTH,
  XWING_PUBLIC_KEY_LENGTH,
  XWING_SECRET_KEY_LENGTH,
  xwingKeyPair,
} from "./wrap.ts";

const anna = xwingKeyPair(new Uint8Array(32).fill(1));
const fingerprint = new Uint8Array(32).fill(9);
const to = { publicKey: anna.publicKey, fingerprint };
const where = { purpose: "vault-key", context: ["vault-1", 0, "anna"] };
const vaultKey = new Uint8Array(32).fill(5);

describe("xwingKeyPair", () => {
  it("makes a 1216-byte public key and a 32-byte secret key", () => {
    const pair = xwingKeyPair();
    expect(pair.publicKey.length).toBe(XWING_PUBLIC_KEY_LENGTH);
    expect(pair.secretKey.length).toBe(XWING_SECRET_KEY_LENGTH);
  });

  it("makes a new pair each time without a seed", () => {
    expect(hex(xwingKeyPair().publicKey)).not.toBe(hex(xwingKeyPair().publicKey));
  });
});

describe("wrap and unwrap", () => {
  const pkg = wrap(to, vaultKey, where);

  it("writes version 1, the X-Wing ciphertext and a box", () => {
    expect(pkg[0]).toBe(WRAP_V1);
    expect(pkg.length).toBe(1 + XWING_CIPHERTEXT_LENGTH + 1 + 24 + 32 + 16);
  });

  it("gives the payload back to the recipient", () => {
    expect(unwrap(anna.secretKey, fingerprint, pkg, where)).toEqual({ ok: true, value: vaultKey });
  });

  it("encapsulates afresh each time", () => {
    expect(hex(wrap(to, vaultKey, where))).not.toBe(hex(pkg));
  });

  it("fails for another recipient's key, fingerprint, purpose or context", () => {
    const notAuthentic = { ok: false, error: "not-authentic" };
    expect(unwrap(xwingKeyPair().secretKey, fingerprint, pkg, where)).toEqual(notAuthentic);
    expect(unwrap(anna.secretKey, new Uint8Array(32), pkg, where)).toEqual(notAuthentic);
    expect(unwrap(anna.secretKey, fingerprint, pkg, { ...where, purpose: "share" })).toEqual(
      notAuthentic,
    );
    expect(
      unwrap(anna.secretKey, fingerprint, pkg, { ...where, context: ["vault-1", 1, "anna"] }),
    ).toEqual(notAuthentic);
  });

  it("refuses another version, a short package and a wrong key length", () => {
    const other = pkg.slice();
    other[0] = 0x02;
    expect(unwrap(anna.secretKey, fingerprint, other, where)).toEqual({
      ok: false,
      error: "unknown-version",
    });
    expect(unwrap(anna.secretKey, fingerprint, new Uint8Array(), where)).toEqual({
      ok: false,
      error: "too-short",
    });
    expect(
      unwrap(anna.secretKey, fingerprint, pkg.subarray(0, 1 + XWING_CIPHERTEXT_LENGTH), where),
    ).toEqual({
      ok: false,
      error: "too-short",
    });
    expect(
      unwrap(anna.secretKey, fingerprint, pkg.subarray(0, 1 + XWING_CIPHERTEXT_LENGTH + 30), where),
    ).toEqual({
      ok: false,
      error: "too-short",
    });
    // Shorter than the smallest package: the KEM ciphertext cut, or a box without nonce and tag
    const smallest = 1 + XWING_CIPHERTEXT_LENGTH + 1 + 24 + 16;
    for (const length of [100, smallest - 2, smallest - 1]) {
      expect(unwrap(anna.secretKey, fingerprint, pkg.subarray(0, length), where)).toEqual({
        ok: false,
        error: "too-short",
      });
    }
    expect(unwrap(anna.secretKey.subarray(1), fingerprint, pkg, where)).toEqual({
      ok: false,
      error: "wrong-key-length",
    });
  });

  it("fails when the box inside claims another version", () => {
    const other = pkg.slice();
    other[1 + XWING_CIPHERTEXT_LENGTH] = 0x02;
    expect(unwrap(anna.secretKey, fingerprint, other, where)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });
});

describe("fingerprints", () => {
  const ed = new Uint8Array(32).fill(3);

  it("are 32 bytes and differ by kind of key", () => {
    const all = [
      bundleFingerprint(anna.publicKey, ed),
      rootFingerprint(ed),
      recoveryFingerprint(anna.publicKey),
    ];
    for (const fp of all) expect(fp.length).toBe(32);
    expect(new Set(all.map(hex)).size).toBe(3);
  });

  it("match their definition in F-04 (SHA-512/256 from node:crypto)", () => {
    const sha = (data: Uint8Array) => createHash("sha512-256").update(data).digest("hex");
    expect(hex(rootFingerprint(ed))).toBe(sha(encode("kennwort/fp-root/v1", ed)));
    expect(hex(recoveryFingerprint(anna.publicKey))).toBe(
      sha(encode("kennwort/fp-recovery/v1", anna.publicKey)),
    );
    expect(hex(bundleFingerprint(anna.publicKey, ed))).toBe(
      sha(encode("kennwort/fp/v1", anna.publicKey, ed)),
    );
  });
});
