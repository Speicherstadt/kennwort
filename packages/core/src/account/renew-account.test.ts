import { passphraseKeysWith, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { createAccount } from "./create.ts";
import {
  ACCOUNT_RENEWAL_PURPOSE,
  RENEWAL_PURPOSE,
  renewalFields,
  renewUnlockWithAccountKey,
} from "./renew.ts";
import { emptyState } from "./state.ts";
import { unlockWithPassphrase, unlockWithRecoveryKey } from "./unlock.ts";

// P-13: after company recovery the account's own Ed25519 key proves the new unlock ways
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const account = createAccount("Vergessene Passphrase", emptyState(new Uint8Array(32).fill(1)), {
  derive: quick,
});
const newSecret = new Uint8Array(16).fill(9);
const renewed = renewUnlockWithAccountKey(
  account.accountKey,
  account.accountId,
  "Neue Passphrase nach Recovery",
  newSecret,
  account.keyBlock.ed.secretKey,
  { derive: quick },
);
const { proof, ...values } = renewed.upload;
const id = encodeBytes(account.accountId);
const after = {
  accountId: account.accountId,
  accountSalt: values.accountSalt,
  keyBlock: account.upload.keyBlock,
  state: account.upload.state,
  stateCounter: 0,
  unlock: values.unlock,
};

describe("renewUnlockWithAccountKey", () => {
  it("is signed by the account's Ed25519 key under its own purpose", () => {
    const ed = account.keyBlock.ed.publicKey;
    expect(ACCOUNT_RENEWAL_PURPOSE).toBe("unlock-renewal-account");
    expect(verify(ed, proof, ACCOUNT_RENEWAL_PURPOSE, ...renewalFields(id, values))).toBe(true);
    expect(verify(ed, proof, RENEWAL_PURPOSE, ...renewalFields(id, values))).toBe(false);
    const other = { ...values, accountSalt: new Uint8Array(16) };
    expect(verify(ed, proof, ACCOUNT_RENEWAL_PURPOSE, ...renewalFields(id, other))).toBe(false);
  });

  it("opens AK with the new passphrase and the new Secret Key, and with the new Recovery Key", () => {
    const byPassphrase = unlockWithPassphrase(
      after,
      "Neue Passphrase nach Recovery",
      newSecret,
      quick,
    );
    expect(byPassphrase.ok && byPassphrase.value.accountKey).toEqual(account.accountKey);
    const byRecovery = unlockWithRecoveryKey(after, renewed.recoveryKey);
    expect(byRecovery.ok && byRecovery.value.accountKey).toEqual(account.accountKey);
    expect(unlockWithPassphrase(after, "Vergessene Passphrase", account.secretKey, quick).ok).toBe(
      false,
    );
  });
});
