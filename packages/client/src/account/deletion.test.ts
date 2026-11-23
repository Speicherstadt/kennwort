import {
  createAccount,
  DELETION_PURPOSE,
  emptyState,
  encodeBytes,
  type Stored,
} from "@kennwort/core";
import { ed25519KeyPair, passphraseKeysWith, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { checkPassphrase, confirmDeletion, type DeletionApi } from "./deletion.ts";

// K-607 (P-28): Anna confirms the deletion of her account with her passphrase
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const PASSPHRASE = "Annas Passphrase lang genug";
const anna = createAccount(PASSPHRASE, emptyState(new Uint8Array(32).fill(1)), { derive: quick });
const account = { accountId: anna.accountId, token: "t-anna", secretKey: anna.secretKey };
const stored: Stored = {
  accountId: anna.accountId,
  accountSalt: anna.upload.accountSalt,
  keyBlock: anna.upload.keyBlock,
  state: anna.upload.state,
  stateCounter: 0,
  unlock: anna.upload.unlock,
};
const challenge = new Uint8Array(32).fill(7);

/** A server stand-in that checks the answer as apps/server does */
const server = ({ keys }: { keys: Stored | undefined } = { keys: stored }) => {
  const asked: string[] = [];
  const api: DeletionApi = {
    keys: async (token) => {
      asked.push(`keys:${token}`);
      return keys;
    },
    deletionChallenge: async (token) => {
      asked.push(`challenge:${token}`);
      return { challengeId: "c1", challenge, accountSalt: anna.upload.accountSalt };
    },
    deleteAccount: async (token, challengeId, signature) => {
      asked.push(`delete:${token}:${challengeId}`);
      const signed = verify(
        anna.upload.loginPublicKey,
        signature,
        DELETION_PURPOSE,
        encodeBytes(anna.accountId),
        challenge,
      );
      return signed ? { ok: true, company: false } : { ok: false, error: "denied" };
    },
  };
  return { api, asked };
};

describe("checkPassphrase", () => {
  it("opens the stored AK with the right passphrase only", async () => {
    const { api, asked } = server();
    expect(await checkPassphrase(api, account, PASSPHRASE, quick)).toEqual({ ok: true });
    expect(await checkPassphrase(api, account, "falsch", quick)).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(asked).toEqual(["keys:t-anna", "keys:t-anna"]);
  });

  it("says so when the server gives no keys", async () => {
    const { api } = server({ keys: undefined });
    expect(await checkPassphrase(api, account, PASSPHRASE, quick)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});

describe("confirmDeletion", () => {
  it("answers the challenge with the sign-in key from the passphrase", async () => {
    const { api, asked } = server();
    expect(await confirmDeletion(api, account, PASSPHRASE, quick)).toEqual({
      ok: true,
      company: false,
    });
    expect(asked).toEqual(["challenge:t-anna", "delete:t-anna:c1"]);
  });

  it("is denied with another passphrase", async () => {
    const { api } = server();
    expect(await confirmDeletion(api, account, "falsch", quick)).toEqual({
      ok: false,
      error: "denied",
    });
  });

  it("deletes nothing without a challenge", async () => {
    const { api, asked } = server();
    const without: DeletionApi = { ...api, deletionChallenge: async () => undefined };
    expect(await confirmDeletion(without, account, PASSPHRASE, quick)).toEqual({
      ok: false,
      error: "unexpected",
    });
    expect(asked).toEqual([]);
  });

  it("signs with no other key than the sign-in key", async () => {
    const other = ed25519KeyPair(new Uint8Array(32).fill(9));
    const { api } = server();
    const strict: DeletionApi = {
      ...api,
      deleteAccount: async (_, __, signature) =>
        verify(other.publicKey, signature, DELETION_PURPOSE, encodeBytes(anna.accountId), challenge)
          ? { ok: true, company: false }
          : { ok: false, error: "denied" },
    };
    expect((await confirmDeletion(strict, account, PASSPHRASE, quick)).ok).toBe(false);
  });
});
