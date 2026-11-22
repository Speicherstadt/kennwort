import { describe, expect, it } from "vitest";
import { newAccountKey, newKeyBlock, sealKeyBlock } from "./account.ts";
import { depositCommitment } from "./company-recovery.ts";
import {
  emergencyAccountCommitment,
  type TakeOverInput,
  unwrapEmergencyAccountKey,
  unwrapEmergencyVaultKey,
  wrapEmergencyAccountKey,
  wrapEmergencyVaultKey,
} from "./emergency.ts";
import { bundleFingerprint } from "./fingerprint.ts";
import { ed25519KeyPair } from "./sign.ts";
import { hex } from "./test-helpers.ts";
import { newVaultKey, vaultKeyCommitment } from "./vault.ts";
import { wrap, xwingKeyPair } from "./wrap.ts";

// Jonas (grantor) names Anna (grantee) for emergency access to the vault Büro, or to his account
const anna = {
  xwing: xwingKeyPair(new Uint8Array(32).fill(0x21)),
  ed: ed25519KeyPair(new Uint8Array(32).fill(0x22)),
};
const annaFp = bundleFingerprint(anna.xwing.publicKey, anna.ed.publicKey);
const to = { publicKey: anna.xwing.publicKey, fingerprint: annaFp };
const me = { secretKey: anna.xwing.secretKey, fingerprint: annaFp };
const jonasId = new Uint8Array(16).fill(0x10);
const annaId = new Uint8Array(16).fill(0x20);
const other = new Uint8Array(16).fill(0x30);
const parties = { grantorId: jonasId, granteeId: annaId };
const place = { vaultId: new Uint8Array(16).fill(0xb0), epoch: 1, ...parties };
const vaultKey = newVaultKey();
const commitment = vaultKeyCommitment(vaultKey, place);
const pkg = wrapEmergencyVaultKey(to, vaultKey, place);
const refused = (error: string) => ({ ok: false, error });

describe("a vault key for emergency access (P-14, view)", () => {
  it("reaches the grantee and matches the commitment of the vault's log", () => {
    expect(unwrapEmergencyVaultKey(me, pkg, place, commitment)).toEqual({
      ok: true,
      value: vaultKey,
    });
  });

  it("opens for exactly its vault, epoch, grantor and grantee", () => {
    for (const elsewhere of [
      { ...place, vaultId: other },
      { ...place, epoch: 2 },
      { ...place, grantorId: other },
      { ...place, granteeId: other },
    ])
      expect(unwrapEmergencyVaultKey(me, pkg, elsewhere, commitment)).toEqual(
        refused("not-authentic"),
      );
  });

  it("refuses a key the server wrapped itself, which matches no signed commitment (E-16)", () => {
    const forged = wrap(to, newVaultKey(), {
      purpose: "emergency",
      context: [place.vaultId, place.epoch, jonasId, annaId],
    });
    expect(unwrapEmergencyVaultKey(me, forged, place, commitment)).toEqual(
      refused("not-committed"),
    );
  });

  it("refuses an authentic package that does not hold 32 bytes, even with its commitment", () => {
    const short = new Uint8Array(16).fill(9);
    const wrapped = wrap(to, short, {
      purpose: "emergency",
      context: [place.vaultId, place.epoch, jonasId, annaId],
    });
    expect(unwrapEmergencyVaultKey(me, wrapped, place, vaultKeyCommitment(short, place))).toEqual(
      refused("not-authentic"),
    );
  });

  it("refuses to wrap anything but a 32-byte key", () => {
    expect(() => wrapEmergencyVaultKey(to, new Uint8Array(31), place)).toThrow(
      "key must be 32 bytes",
    );
    expect(() => wrapEmergencyAccountKey(to, new Uint8Array(33), parties)).toThrow(
      "key must be 32 bytes",
    );
  });
});

const root = new Uint8Array(32).fill(0x70);
const accountKey = newAccountKey();
const jonasBlock = newKeyBlock(root);
const certified = {
  xwingPublicKey: jonasBlock.xwing.publicKey,
  edPublicKey: jonasBlock.ed.publicKey,
};
const takeOver = (changes: Partial<TakeOverInput> = {}): TakeOverInput => ({
  me,
  pkg: wrapEmergencyAccountKey(to, accountKey, parties),
  parties,
  signedCommitment: emergencyAccountCommitment(accountKey, jonasId),
  certified,
  sealedKeyBlock: sealKeyBlock(accountKey, jonasId, jonasBlock),
  rootFingerprint: root,
  ...changes,
});

describe("the grantor's AK for emergency access (P-14, full)", () => {
  it("opens the grantor's key block with its certified keys and the grantee's root", () => {
    expect(unwrapEmergencyAccountKey(takeOver())).toEqual({
      ok: true,
      value: { accountKey, keyBlock: jonasBlock },
    });
  });

  it("wraps AK under its own purpose, apart from a vault key's", () => {
    const where = { purpose: "emergency-account", context: [jonasId, annaId] };
    expect(unwrapEmergencyAccountKey(takeOver({ pkg: wrap(to, accountKey, where) })).ok).toBe(true);
  });

  it("commits to AK per grantor, apart from the company recovery deposit", () => {
    const base = hex(emergencyAccountCommitment(accountKey, jonasId));
    expect(hex(emergencyAccountCommitment(accountKey, other))).not.toBe(base);
    expect(hex(emergencyAccountCommitment(newAccountKey(), jonasId))).not.toBe(base);
    expect(hex(depositCommitment(accountKey, jonasId))).not.toBe(base);
  });

  it("opens for exactly its grantor and grantee", () => {
    expect(
      unwrapEmergencyAccountKey(takeOver({ parties: { ...parties, granteeId: other } })),
    ).toEqual(refused("not-authentic"));
    expect(
      unwrapEmergencyAccountKey(takeOver({ parties: { ...parties, grantorId: other } })),
    ).toEqual(refused("not-authentic"));
  });

  it("refuses an AK the server wrapped itself", () => {
    const forged = wrapEmergencyAccountKey(to, newAccountKey(), parties);
    expect(unwrapEmergencyAccountKey(takeOver({ pkg: forged }))).toEqual(refused("not-committed"));
  });

  it("refuses a key block AK does not open, or one with other keys than the certified ones", () => {
    const sealedForAnna = sealKeyBlock(accountKey, annaId, jonasBlock);
    expect(unwrapEmergencyAccountKey(takeOver({ sealedKeyBlock: sealedForAnna }))).toEqual(
      refused("wrong-key-block"),
    );
    const swapped = { ...certified, edPublicKey: anna.ed.publicKey };
    expect(unwrapEmergencyAccountKey(takeOver({ certified: swapped }))).toEqual(
      refused("wrong-key-block"),
    );
  });

  it("refuses a key block under another company root than the grantee's", () => {
    expect(unwrapEmergencyAccountKey(takeOver({ rootFingerprint: new Uint8Array(32) }))).toEqual(
      refused("wrong-root"),
    );
  });
});
