import { describe, expect, it } from "vitest";
import { bundleFingerprint } from "./fingerprint.ts";
import { shareKeyCommitment, unwrapShareKey, wrapShareKey } from "./share.ts";
import { ed25519KeyPair } from "./sign.ts";
import { hex } from "./test-helpers.ts";
import { newEntryKey } from "./vault.ts";
import { wrap, xwingKeyPair } from "./wrap.ts";

// Sandra, outside the vault, gets the entry key of one entry
const sandra = {
  xwing: xwingKeyPair(new Uint8Array(32).fill(4)),
  ed: ed25519KeyPair(new Uint8Array(32).fill(5)),
};
const sandraId = new Uint8Array(16).fill(0x40);
const sandraFp = bundleFingerprint(sandra.xwing.publicKey, sandra.ed.publicKey);
const to = { publicKey: sandra.xwing.publicKey, fingerprint: sandraFp };
const me = { secretKey: sandra.xwing.secretKey, fingerprint: sandraFp, accountId: sandraId };
const place = { vaultId: new Uint8Array(16).fill(0xb0), entryId: new Uint8Array(16).fill(0xe0) };
const entryKey = newEntryKey();
const commitment = shareKeyCommitment(entryKey, place);
const pkg = wrapShareKey(to, sandraId, entryKey, place);
const notAuthentic = { ok: false, error: "not-authentic" };

describe("sharing an entry key (P-10)", () => {
  it("reaches the recipient and matches the signed binding", () => {
    expect(unwrapShareKey(me, pkg, place, commitment)).toEqual({ ok: true, value: entryKey });
  });

  it("fails for another recipient, vault or entry", () => {
    const other = new Uint8Array(16).fill(0x41);
    expect(unwrapShareKey({ ...me, accountId: other }, pkg, place, commitment)).toEqual(
      notAuthentic,
    );
    expect(unwrapShareKey(me, pkg, { ...place, vaultId: other }, commitment)).toEqual(notAuthentic);
    expect(unwrapShareKey(me, pkg, { ...place, entryId: other }, commitment)).toEqual(notAuthentic);
  });

  it("refuses a key the server wrapped itself, which matches no signed binding (E-16)", () => {
    const forged = wrap(to, newEntryKey(), {
      purpose: "share",
      context: [place.vaultId, place.entryId, sandraId],
    });
    expect(unwrapShareKey(me, forged, place, commitment)).toEqual({
      ok: false,
      error: "not-committed",
    });
  });

  it("refuses an authentic package that does not hold 32 bytes, even with its binding", () => {
    const short = new Uint8Array(16).fill(9);
    const wrapped = wrap(to, short, {
      purpose: "share",
      context: [place.vaultId, place.entryId, sandraId],
    });
    expect(unwrapShareKey(me, wrapped, place, shareKeyCommitment(short, place))).toEqual(
      notAuthentic,
    );
  });

  it("binds a key per vault and entry, apart from the vault key's binding", () => {
    const base = hex(commitment);
    const other = new Uint8Array(16).fill(0x41);
    expect(hex(shareKeyCommitment(entryKey, { ...place, entryId: other }))).not.toBe(base);
    expect(hex(shareKeyCommitment(entryKey, { ...place, vaultId: other }))).not.toBe(base);
    expect(hex(shareKeyCommitment(newEntryKey(), place))).not.toBe(base);
  });

  it("refuses to wrap a key that is not 32 bytes", () => {
    expect(() => wrapShareKey(to, sandraId, new Uint8Array(16), place)).toThrow(
      "entry key must be 32 bytes",
    );
  });
});
