import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { seal } from "./box.ts";
import { bundleFingerprint } from "./fingerprint.ts";
import { ed25519KeyPair } from "./sign.ts";
import { hex } from "./test-helpers.ts";
import {
  newEntryKey,
  newVaultKey,
  openEntry,
  openEntryKey,
  PADDING_BLOCK,
  pad,
  sealEntry,
  sealEntryKey,
  unpad,
  unwrapVaultKey,
  vaultKeyCommitment,
  wrapVaultKey,
} from "./vault.ts";
import { wrap, xwingKeyPair } from "./wrap.ts";

const anna = {
  xwing: xwingKeyPair(new Uint8Array(32).fill(2)),
  ed: ed25519KeyPair(new Uint8Array(32).fill(3)),
};
const annaId = new Uint8Array(16).fill(0xa0);
const annaFp = bundleFingerprint(anna.xwing.publicKey, anna.ed.publicKey);
const me = { secretKey: anna.xwing.secretKey, fingerprint: annaFp, memberId: annaId };
const vault = { vaultId: new Uint8Array(16).fill(0xb0), epoch: 2 };
const entry = { ...vault, entryId: new Uint8Array(16).fill(0xe0) };
const vaultKey = newVaultKey();

describe("vault key (P-05, P-06)", () => {
  const commitment = vaultKeyCommitment(vaultKey, vault);
  const pkg = wrapVaultKey(
    { publicKey: anna.xwing.publicKey, fingerprint: annaFp },
    annaId,
    vaultKey,
    vault,
  );

  it("reaches the member and matches the signed commitment", () => {
    expect(unwrapVaultKey(me, pkg, vault, commitment)).toEqual({ ok: true, value: vaultKey });
  });

  it("fails for another member, epoch or vault", () => {
    const notAuthentic = { ok: false, error: "not-authentic" };
    expect(unwrapVaultKey({ ...me, memberId: new Uint8Array(16) }, pkg, vault, commitment)).toEqual(
      notAuthentic,
    );
    expect(unwrapVaultKey(me, pkg, { ...vault, epoch: 3 }, commitment)).toEqual(notAuthentic);
    expect(unwrapVaultKey(me, pkg, { ...vault, vaultId: new Uint8Array(16) }, commitment)).toEqual(
      notAuthentic,
    );
  });

  it("refuses a key the server wrapped itself, which matches no signed commitment (E-16)", () => {
    const forged = wrap({ publicKey: anna.xwing.publicKey, fingerprint: annaFp }, newVaultKey(), {
      purpose: "vault-key",
      context: [vault.vaultId, vault.epoch, annaId],
    });
    expect(unwrapVaultKey(me, forged, vault, commitment)).toEqual({
      ok: false,
      error: "not-committed",
    });
  });

  it("commits to a key per vault and epoch", () => {
    const base = hex(commitment);
    expect(hex(vaultKeyCommitment(vaultKey, { ...vault, epoch: 3 }))).not.toBe(base);
    expect(hex(vaultKeyCommitment(newVaultKey(), vault))).not.toBe(base);
  });
});

describe("entry key and content (P-09)", () => {
  const entryKey = newEntryKey();
  const sealedKey = sealEntryKey(vaultKey, entryKey, entry);
  const content = new TextEncoder().encode('{"title":"Sparkasse","password":"Weber-2026!"}');
  const sealed = sealEntry(entryKey, content, entry, 7);

  it("opens the entry key under the vault key and the content under the entry key", () => {
    expect(openEntryKey(vaultKey, sealedKey, entry)).toEqual({ ok: true, value: entryKey });
    expect(openEntry(entryKey, sealed, entry, 7)).toEqual({ ok: true, value: content });
  });

  it("fails for another vault key, entry, epoch or version", () => {
    expect(openEntryKey(newVaultKey(), sealedKey, entry).ok).toBe(false);
    expect(openEntryKey(vaultKey, sealedKey, { ...entry, entryId: new Uint8Array(16) }).ok).toBe(
      false,
    );
    expect(openEntryKey(vaultKey, sealedKey, { ...entry, epoch: 1 }).ok).toBe(false);
    expect(openEntry(entryKey, sealed, entry, 6)).toEqual({ ok: false, error: "not-authentic" });
    expect(openEntry(entryKey, sealed, { ...entry, entryId: new Uint8Array(16) }, 7)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("refuses an authentic entry key box that does not hold 32 bytes", () => {
    const wrong = seal(vaultKey, new Uint8Array(16), {
      purpose: "entry-key",
      context: [entry.vaultId, entry.entryId, entry.epoch],
    });
    expect(openEntryKey(vaultKey, wrong, entry)).toEqual({ ok: false, error: "not-authentic" });
  });

  it("pads the content, so the box shows only its size in steps of 256 bytes", () => {
    expect(sealed.length).toBe(1 + 24 + PADDING_BLOCK + 16);
    expect(sealEntry(entryKey, new Uint8Array(255), entry, 1).length).toBe(sealed.length);
    expect(sealEntry(entryKey, new Uint8Array(256), entry, 1).length).toBe(
      sealed.length + PADDING_BLOCK,
    );
  });

  it("refuses authentic content with broken padding", () => {
    const place = { purpose: "entry", context: [entry.vaultId, entry.entryId, 7] };
    const broken = seal(entryKey, new Uint8Array(PADDING_BLOCK), place);
    expect(openEntry(entryKey, broken, entry, 7)).toEqual({ ok: false, error: "malformed" });
  });
});

describe("pad and unpad", () => {
  it("round-trip every content (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (content) => {
        const padded = pad(content);
        expect(padded.length % PADDING_BLOCK).toBe(0);
        expect(padded.length).toBeGreaterThan(content.length);
        expect(unpad(padded)).toEqual({ ok: true, value: content });
      }),
    );
  });

  it("refuse an empty block, a length off the grid and a missing 0x80 marker", () => {
    expect(unpad(new Uint8Array())).toEqual({ ok: false, error: "malformed" });
    expect(unpad(new Uint8Array(255).fill(0x80))).toEqual({ ok: false, error: "malformed" });
    expect(unpad(new Uint8Array(PADDING_BLOCK))).toEqual({ ok: false, error: "malformed" });
    const noMarker = new Uint8Array(PADDING_BLOCK);
    noMarker[3] = 0x81;
    expect(unpad(noMarker)).toEqual({ ok: false, error: "malformed" });
  });

  it("keeps content that ends in 0x80 or zero bytes", () => {
    for (const content of [
      Uint8Array.of(0x80),
      Uint8Array.of(1, 0, 0),
      new Uint8Array(PADDING_BLOCK - 1),
    ]) {
      expect(unpad(pad(content))).toEqual({ ok: true, value: content });
    }
  });
});

describe("sealing an entry key", () => {
  it("refuses a key that is not 32 bytes", () => {
    expect(() => sealEntryKey(vaultKey, new Uint8Array(16), entry)).toThrow(
      "entry key must be 32 bytes",
    );
  });
});
