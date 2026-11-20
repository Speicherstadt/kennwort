import { openAccountKey, passphraseKeysWith, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { loginKeyPair, recoveryLoginKeyPair } from "../auth/sign-in.ts";
import { encodeBytes } from "../sync/bytes.ts";
import { createAccount } from "./create.ts";
import { RENEWAL_PURPOSE, renewalFields, renewUnlock } from "./renew.ts";
import { emptyState } from "./state.ts";
import { unlockWithPassphrase, unlockWithRecoveryKey } from "./unlock.ts";

const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const account = createAccount(
  "Alte Passphrase lang genug",
  emptyState(new Uint8Array(32).fill(1)),
  {
    derive: quick,
  },
);
const stored = (upload: ReturnType<typeof createAccount>["upload"]) => ({
  accountId: account.accountId,
  accountSalt: upload.accountSalt,
  keyBlock: upload.keyBlock,
  state: upload.state,
  stateCounter: 0,
  unlock: upload.unlock,
});

describe("renewUnlock", () => {
  const renewed = renewUnlock(
    account.accountKey,
    account.accountId,
    "Neue Passphrase lang genug",
    account.secretKey,
    account.recoveryKey,
    {
      derive: quick,
    },
  );
  const after = { ...stored(account.upload), ...renewed.upload, unlock: renewed.upload.unlock };

  it("opens the same AK with the new passphrase and the new Recovery Key, and not with the old ones", () => {
    const withPassphrase = unlockWithPassphrase(
      after,
      "Neue Passphrase lang genug",
      account.secretKey,
      quick,
    );
    expect(withPassphrase.ok && withPassphrase.value.accountKey).toEqual(account.accountKey);
    const withRecovery = unlockWithRecoveryKey(after, renewed.recoveryKey);
    expect(withRecovery.ok && withRecovery.value.accountKey).toEqual(account.accountKey);
    expect(
      unlockWithPassphrase(after, "Alte Passphrase lang genug", account.secretKey, quick).ok,
    ).toBe(false);
    expect(unlockWithRecoveryKey(after, account.recoveryKey).ok).toBe(false);
  });

  it("gives a new salt, a new Recovery Key and the sign-in keys that belong to them", () => {
    expect(renewed.upload.accountSalt).toHaveLength(16);
    expect(renewed.upload.accountSalt).not.toEqual(account.upload.accountSalt);
    expect(renewed.recoveryKey).toHaveLength(32);
    expect(renewed.recoveryKey).not.toEqual(account.recoveryKey);
    expect(renewed.upload.loginPublicKey).toEqual(
      loginKeyPair(
        "Neue Passphrase lang genug",
        renewed.upload.accountSalt,
        account.secretKey,
        account.accountId,
        quick,
      ).publicKey,
    );
    expect(renewed.upload.recoveryLoginPublicKey).toEqual(
      recoveryLoginKeyPair(renewed.recoveryKey, account.accountId).publicKey,
    );
  });

  it("binds each box to its way", () => {
    expect(
      openAccountKey(renewed.recoveryKey, renewed.upload.unlock.passphrase, account.accountId, {
        kind: "recovery",
      }).ok,
    ).toBe(false);
  });

  it("uses what it is given for salt and Recovery Key", () => {
    const fixed = renewUnlock(
      account.accountKey,
      account.accountId,
      "x y z w",
      account.secretKey,
      account.recoveryKey,
      {
        derive: quick,
        random: (length) => new Uint8Array(length).fill(4),
        newRecovery: () => new Uint8Array(32).fill(6),
      },
    );
    expect(fixed.upload.accountSalt).toEqual(new Uint8Array(16).fill(4));
    expect(fixed.recoveryKey).toEqual(new Uint8Array(32).fill(6));
  });

  it("sends nothing secret", () => {
    const sent = JSON.stringify(renewed.upload, (_, v) =>
      v instanceof Uint8Array ? Array.from(v).join(",") : v,
    );
    for (const secret of [account.accountKey, account.secretKey, renewed.recoveryKey])
      expect(sent.includes(Array.from(secret).join(","))).toBe(false);
  });
});

describe("the renewal proof", () => {
  const renewed = renewUnlock(
    account.accountKey,
    account.accountId,
    "Neue Passphrase lang genug",
    account.secretKey,
    account.recoveryKey,
    {
      derive: quick,
    },
  );
  const { proof, ...values } = renewed.upload;
  const spent = recoveryLoginKeyPair(account.recoveryKey, account.accountId).publicKey;
  const id = encodeBytes(account.accountId);

  it("is signed by the spent Recovery Key's sign-in key over the account and every new value", () => {
    expect(verify(spent, proof, RENEWAL_PURPOSE, ...renewalFields(id, values))).toBe(true);
    expect(RENEWAL_PURPOSE).toBe("unlock-renewal");
  });

  it("does not hold for other values, another account, another purpose or the new key", () => {
    const changed = [
      { ...values, accountSalt: new Uint8Array(16) },
      { ...values, loginPublicKey: new Uint8Array(32) },
      { ...values, recoveryLoginPublicKey: new Uint8Array(32) },
      { ...values, unlock: { ...values.unlock, passphrase: new Uint8Array(73) } },
      { ...values, unlock: { ...values.unlock, recovery: new Uint8Array(73) } },
    ];
    for (const other of changed)
      expect(verify(spent, proof, RENEWAL_PURPOSE, ...renewalFields(id, other))).toBe(false);
    expect(verify(spent, proof, RENEWAL_PURPOSE, ...renewalFields("jemand", values))).toBe(false);
    expect(verify(spent, proof, "login-recovery", ...renewalFields(id, values))).toBe(false);
    expect(
      verify(values.recoveryLoginPublicKey, proof, RENEWAL_PURPOSE, ...renewalFields(id, values)),
    ).toBe(false);
  });

  // Review of K-303: AK is not rotated, so the spent key still opens a box that someone kept.
  // The docs say so (P-12); this test keeps them honest until AK rotation exists.
  it("leaves the old recovery box valid for the old key: renewal stops sign-in, not a kept box", () => {
    const before = stored(account.upload);
    const after = {
      ...before,
      ...values,
      unlock: { ...values.unlock, recovery: before.unlock.recovery },
    };
    expect(unlockWithRecoveryKey(after, account.recoveryKey).ok).toBe(true);
  });
});

describe("createAccount", () => {
  it("uploads the Recovery Key's sign-in key", () => {
    expect(account.upload.recoveryLoginPublicKey).toEqual(
      recoveryLoginKeyPair(account.recoveryKey, account.accountId).publicKey,
    );
  });
});
