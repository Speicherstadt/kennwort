import {
  isSignedRekey,
  kdf,
  keyBlockFingerprint,
  openKeyBlock,
  passphraseKeysWith,
  unwrapVaultKey,
  vaultKeyCommitment,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { loginKeyPair, recoveryLoginKeyPair } from "../auth/sign-in.ts";
import { encodeBytes } from "../sync/bytes.ts";
import { createAccount } from "./create.ts";
import { derivedPersonalVault, rekeyAccount } from "./rekey.ts";
import { emptyState, openState } from "./state.ts";
import { type Stored, unlockWithPassphrase, unlockWithRecoveryKey } from "./unlock.ts";

// Anna's recovery kit got into other hands: her device renews every key of the account (P-12)
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const passphrase = "Annas Passphrase lang genug";
const anna = createAccount(passphrase, emptyState(new Uint8Array(32).fill(1)), { derive: quick });
const vaultId = new Uint8Array(16).fill(0xb0);
const rings = [0, 1].map((epoch) => ({
  vaultId,
  epoch,
  vaultKey: new Uint8Array(32).fill(0x50 + epoch),
}));
const current = {
  accountId: anna.accountId,
  accountKey: anna.accountKey,
  keyBlock: anna.keyBlock,
  state: anna.state,
  stateCounter: 4,
};
const rekeyed = rekeyAccount(current, passphrase, rings, { derive: quick });
const { upload } = rekeyed;
const stored: Stored = {
  accountId: anna.accountId,
  accountSalt: upload.accountSalt,
  keyBlock: upload.keyBlock,
  state: upload.state,
  stateCounter: upload.stateCounter,
  unlock: upload.unlock,
};

describe("rekeyAccount", () => {
  it("makes a new AK, Secret Key, Recovery Key and key pairs, under the same root", () => {
    expect(rekeyed.accountKey).not.toEqual(anna.accountKey);
    expect(rekeyed.secretKey).not.toEqual(anna.secretKey);
    expect(rekeyed.secretKey).toHaveLength(16);
    expect(rekeyed.recoveryKey).not.toEqual(anna.recoveryKey);
    expect(rekeyed.keyBlock.ed.publicKey).not.toEqual(anna.keyBlock.ed.publicKey);
    expect(rekeyed.keyBlock.xwing.publicKey).not.toEqual(anna.keyBlock.xwing.publicKey);
    expect(rekeyed.keyBlock.rootFingerprint).toEqual(anna.keyBlock.rootFingerprint);
    expect(upload.accountSalt).toHaveLength(16);
    expect(upload.accountSalt).not.toEqual(anna.upload.accountSalt);
    expect(upload.xwingPublicKey).toEqual(rekeyed.keyBlock.xwing.publicKey);
    expect(upload.edPublicKey).toEqual(rekeyed.keyBlock.ed.publicKey);
  });

  it("is signed by the previous Ed25519 key over everything it uploads (F-11)", () => {
    const { proof, ...statement } = upload;
    expect(isSignedRekey(anna.keyBlock.ed.publicKey, proof, statement)).toBe(true);
    expect(isSignedRekey(rekeyed.keyBlock.ed.publicKey, proof, statement)).toBe(false);
  });

  it("opens with the same passphrase and the new Secret Key, not the old one", () => {
    const opened = unlockWithPassphrase(stored, passphrase, rekeyed.secretKey, quick);
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.value.accountKey).toEqual(rekeyed.accountKey);
    expect(opened.value.keyBlock).toEqual(rekeyed.keyBlock);
    expect(unlockWithPassphrase(stored, passphrase, anna.secretKey, quick)).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });

  it("opens with the new Recovery Key, never with the old one", () => {
    expect(unlockWithRecoveryKey(stored, rekeyed.recoveryKey).ok).toBe(true);
    expect(unlockWithRecoveryKey(stored, anna.recoveryKey)).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });

  it("names the new sign-in keys of passphrase and Recovery Key", () => {
    const login = loginKeyPair(
      passphrase,
      upload.accountSalt,
      rekeyed.secretKey,
      anna.accountId,
      quick,
    );
    expect(upload.loginPublicKey).toEqual(login.publicKey);
    expect(upload.recoveryLoginPublicKey).toEqual(
      recoveryLoginKeyPair(rekeyed.recoveryKey, anna.accountId).publicKey,
    );
  });

  it("seals the state under the new AK with the next counter, keeping the personal vault's ID", () => {
    expect(upload.stateCounter).toBe(5);
    const state = openState(rekeyed.accountKey, anna.accountId, 5, upload.state);
    expect(state).toEqual({ ok: true, value: rekeyed.state });
    expect(rekeyed.state.personalVault).toBe(
      encodeBytes(derivedPersonalVault(anna.accountKey, anna.accountId)),
    );
    expect(openState(anna.accountKey, anna.accountId, 5, upload.state).ok).toBe(false);
    const again = rekeyAccount(
      { ...current, accountKey: rekeyed.accountKey, state: rekeyed.state },
      passphrase,
      [],
      { derive: quick },
    );
    expect(again.state.personalVault).toBe(rekeyed.state.personalVault);
  });

  it("derives the personal vault's ID as P-05 says", () => {
    expect(derivedPersonalVault(anna.accountKey, anna.accountId)).toEqual(
      kdf(anna.accountKey, new Uint8Array(), "kennwort/personal-vault/v1", anna.accountId).slice(
        0,
        16,
      ),
    );
  });

  it("wraps every vault key it holds to the new bundle only", () => {
    expect(upload.vaultKeys.map((k) => [encodeBytes(k.vaultId), k.epoch])).toEqual([
      [encodeBytes(vaultId), 0],
      [encodeBytes(vaultId), 1],
    ]);
    for (const [index, key] of upload.vaultKeys.entries()) {
      const place = { vaultId, epoch: key.epoch };
      const commitment = vaultKeyCommitment(
        (rings[index] as (typeof rings)[number]).vaultKey,
        place,
      );
      const reader = (block: typeof anna.keyBlock) => ({
        secretKey: block.xwing.secretKey,
        fingerprint: keyBlockFingerprint(block),
        memberId: anna.accountId,
      });
      expect(unwrapVaultKey(reader(rekeyed.keyBlock), key.wrapped, place, commitment)).toEqual({
        ok: true,
        value: rings[index]?.vaultKey,
      });
      expect(unwrapVaultKey(reader(anna.keyBlock), key.wrapped, place, commitment).ok).toBe(false);
    }
  });

  it("leaves nothing the old AK opens", () => {
    expect(openKeyBlock(anna.accountKey, anna.accountId, upload.keyBlock).ok).toBe(false);
  });
});
