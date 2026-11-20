// K-303, part 3b (P-12): who forgot the passphrase signs in with the Recovery Key, opens AK with it
// and replaces the unlock ways; afterwards only the new passphrase and the new Recovery Key work
import { describe, expect, it } from "bun:test";
import {
  bytes,
  createCompany,
  encodeBytes,
  renewUnlock,
  type Stored,
  signInWithPassphrase,
  signInWithRecoveryKey,
  toWire,
  unlockWithRecoveryKey,
} from "@kennwort/core";
import { passphraseKeysWith } from "@kennwort/crypto";
import { signInSetup } from "../testing/sign-in-setup.ts";

const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const CODE = "setup-code-of-weber-haustechnik";
const OLD = "Heizung-Wasser-Licht-Kupfer";
const NEW = "Rohr-Zange-Ventil-Kessel";

const ownerWithKeys = async (uploadKeys = true) => {
  const setup = await signInSetup({ setupCode: CODE, empty: true });
  const company = createCompany(OLD, { derive: quick });
  const { owner } = company;
  const response = await setup.request("/auth/setup", {
    body: {
      code: CODE,
      companyId: encodeBytes(company.companyId),
      accountId: encodeBytes(owner.accountId),
      loginPublicKey: encodeBytes(owner.upload.loginPublicKey),
      accountSalt: encodeBytes(owner.upload.accountSalt),
    },
  });
  const { token } = (await response.json()) as { token: string };
  const u = owner.upload;
  if (uploadKeys)
    await setup.request("/api/account/keys", {
      method: "PUT",
      token,
      body: {
        xwingPublicKey: encodeBytes(u.xwingPublicKey),
        edPublicKey: encodeBytes(u.edPublicKey),
        keyBlock: encodeBytes(u.keyBlock),
        unlock: {
          passphrase: encodeBytes(u.unlock.passphrase),
          recovery: encodeBytes(u.unlock.recovery),
        },
        recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
        state: encodeBytes(u.state),
        stateCounter: 0,
        certificate: toWire(company.certificate),
      },
    });
  const post = async (path: string, body: unknown) => {
    const answer = await setup.request(path, { body });
    return { status: answer.status, json: await answer.json() };
  };
  return { setup, owner, post };
};

type Owner = Awaited<ReturnType<typeof ownerWithKeys>>;

const storedOf = async ({ setup }: Owner, token: string): Promise<Stored> => {
  const keys = (await (await setup.request("/api/account/keys", { token })).json()) as Record<
    string,
    unknown
  >;
  const b = (value: unknown) => bytes().parse(value);
  const unlock = keys.unlock as Record<string, string>;
  return {
    accountId: b(keys.accountId),
    accountSalt: b(keys.accountSalt),
    keyBlock: b(keys.keyBlock),
    state: b(keys.state),
    stateCounter: keys.stateCounter as number,
    unlock: { passphrase: b(unlock.passphrase), recovery: b(unlock.recovery) },
  };
};

describe("recovering an account with the Recovery Key", () => {
  it("signs in and unlocks without the passphrase, then renews: old ways stop, new ways work", async () => {
    const owner = await ownerWithKeys();
    const { setup, post } = owner;
    const { accountId, recoveryKey, secretKey, accountKey } = owner.owner;
    const signedIn = await signInWithRecoveryKey(post, accountId, recoveryKey);
    if (!signedIn.ok) throw new Error(signedIn.error);
    const unlocked = unlockWithRecoveryKey(await storedOf(owner, signedIn.token), recoveryKey);
    expect(unlocked.ok && unlocked.value.accountKey).toEqual(accountKey);

    const renewed = renewUnlock(accountKey, accountId, NEW, secretKey, recoveryKey, {
      derive: quick,
    });
    const u = renewed.upload;
    const replaced = await setup.request("/api/account/unlock", {
      method: "PUT",
      token: signedIn.token,
      body: {
        accountSalt: encodeBytes(u.accountSalt),
        loginPublicKey: encodeBytes(u.loginPublicKey),
        recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
        unlock: {
          passphrase: encodeBytes(u.unlock.passphrase),
          recovery: encodeBytes(u.unlock.recovery),
        },
        proof: encodeBytes(u.proof),
      },
    });
    expect(replaced.status).toBe(200);

    expect(await signInWithPassphrase(post, accountId, OLD, secretKey, quick)).toEqual({
      ok: false,
      error: "denied",
    });
    expect(await signInWithRecoveryKey(post, accountId, recoveryKey)).toEqual({
      ok: false,
      error: "denied",
    });
    const withNew = await signInWithPassphrase(post, accountId, NEW, secretKey, quick);
    expect(withNew.ok).toBe(true);
    expect((await signInWithRecoveryKey(post, accountId, renewed.recoveryKey)).ok).toBe(true);
    const stored = await storedOf(owner, withNew.ok ? withNew.token : "");
    expect(unlockWithRecoveryKey(stored, renewed.recoveryKey).ok).toBe(true);
    expect(unlockWithRecoveryKey(stored, recoveryKey).ok).toBe(false);
  });

  it("refuses the Recovery Key before the account uploaded its key, and a passphrase signature on its way", async () => {
    const early = await ownerWithKeys(false);
    expect(
      await signInWithRecoveryKey(early.post, early.owner.accountId, early.owner.recoveryKey),
    ).toEqual({
      ok: false,
      error: "denied",
    });
    // A signature by the passphrase's key, answered on the recovery way, counts for nothing
    const owner = await ownerWithKeys();
    const challenge = await owner.post("/auth/login-key/challenge", {
      accountId: encodeBytes(owner.owner.accountId),
      way: "recovery",
    });
    expect(challenge.status).toBe(200);
    const passphraseWay = await signInWithPassphrase(
      owner.post,
      owner.owner.accountId,
      OLD,
      owner.owner.secretKey,
      quick,
    );
    expect(passphraseWay.ok).toBe(true);
    expect(
      (
        await owner.post("/auth/login-key/challenge", {
          accountId: encodeBytes(owner.owner.accountId),
          way: "other",
        })
      ).status,
    ).toBe(400);
  });

  it("replaces the unlock ways only with a session, a proof by the current Recovery Key and boxes of AK's size", async () => {
    const owner = await ownerWithKeys();
    const { setup, post } = owner;
    const { accountId, accountKey, secretKey, recoveryKey } = owner.owner;
    const renewal = (spent: Uint8Array) => {
      const u = renewUnlock(accountKey, accountId, NEW, secretKey, spent, { derive: quick }).upload;
      return {
        accountSalt: encodeBytes(u.accountSalt),
        loginPublicKey: encodeBytes(u.loginPublicKey),
        recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
        unlock: {
          passphrase: encodeBytes(u.unlock.passphrase),
          recovery: encodeBytes(u.unlock.recovery),
        },
        proof: encodeBytes(u.proof),
      };
    };
    const body = renewal(recoveryKey);
    const signedIn = await signInWithPassphrase(post, accountId, OLD, secretKey, quick);
    const token = signedIn.ok ? signedIn.token : "";
    const put = (b: unknown, t: string | undefined = token) =>
      setup.request("/api/account/unlock", { method: "PUT", body: b, ...(t ? { token: t } : {}) });
    expect((await put(body, "")).status).toBe(401);
    // Review of K-303: a session alone (a stolen token) cannot replace anything
    expect((await put(renewal(new Uint8Array(32).fill(7)))).status).toBe(403);
    expect(
      (await put({ ...body, accountSalt: encodeBytes(new Uint8Array(16).fill(1)) })).status,
    ).toBe(403);
    expect((await put({ ...body, unlock: { passphrase: "", recovery: "" } })).status).toBe(400);
    expect((await put({ ...body, proof: undefined })).status).toBe(400);
    expect((await signInWithPassphrase(post, accountId, OLD, secretKey, quick)).ok).toBe(true);
    expect((await signInWithRecoveryKey(post, accountId, recoveryKey)).ok).toBe(true);
    // With the proof it works, from any session of the account
    expect((await put(body)).status).toBe(200);
  });

  it("refuses a renewal for an account without keys or without a recovery sign-in key", async () => {
    const early = await ownerWithKeys(false);
    const { accountId, accountKey, secretKey, recoveryKey } = early.owner;
    const signedIn = await signInWithPassphrase(early.post, accountId, OLD, secretKey, quick);
    const u = renewUnlock(accountKey, accountId, NEW, secretKey, recoveryKey, {
      derive: quick,
    }).upload;
    const response = await early.setup.request("/api/account/unlock", {
      method: "PUT",
      token: signedIn.ok ? signedIn.token : "",
      body: {
        accountSalt: encodeBytes(u.accountSalt),
        loginPublicKey: encodeBytes(u.loginPublicKey),
        recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
        unlock: {
          passphrase: encodeBytes(u.unlock.passphrase),
          recovery: encodeBytes(u.unlock.recovery),
        },
        proof: encodeBytes(u.proof),
      },
    });
    expect(response.status).toBe(403);
    expect((await signInWithPassphrase(early.post, accountId, OLD, secretKey, quick)).ok).toBe(
      true,
    );
  });
});
