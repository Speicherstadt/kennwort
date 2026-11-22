import {
  createAccount,
  emptyState,
  encodeBytes,
  type RekeyUpload,
  type Stored,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "@kennwort/core";
import { isSignedRekey, passphraseKeysWith, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { RekeyAnswer } from "../session/api.ts";
import { type RenewalApi, renewKeys } from "./renewal.ts";

// Anna renews her keys (P-12) against a server stand-in that keeps her ciphertexts
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const PASSPHRASE = "Annas Passphrase lang genug";
const anna = createAccount(PASSPHRASE, emptyState(new Uint8Array(32).fill(1)), { derive: quick });
const company = new Uint8Array(16).fill(0xc0);
const ring = {
  vaultId: new Uint8Array(16).fill(0xb0),
  epoch: 0,
  vaultKey: new Uint8Array(32).fill(5),
};
const opened = {
  accountId: anna.accountId,
  accountKey: anna.accountKey,
  keyBlock: anna.keyBlock,
  state: anna.state,
  token: "t-anna",
};

const server = (answers: RekeyAnswer[] = ["ok"]) => {
  let stored: Stored | undefined = {
    accountId: anna.accountId,
    accountSalt: anna.upload.accountSalt,
    keyBlock: anna.upload.keyBlock,
    state: anna.upload.state,
    stateCounter: 0,
    unlock: anna.upload.unlock,
  };
  const uploads: RekeyUpload[] = [];
  const audits: { action: string; subject: string; signature: Uint8Array }[] = [];
  const api: RenewalApi = {
    keys: async () => stored,
    rekey: async (_, upload) => {
      uploads.push(upload);
      return answers.shift() ?? "ok";
    },
    auditAction: async (_, action, subject, signature) => {
      audits.push({ action, subject, signature });
      return true;
    },
  };
  return { api, uploads, audits, lose: () => (stored = undefined) };
};
const input = { passphrase: PASSPHRASE, secretKey: anna.secretKey, rings: [ring], derive: quick };

describe("renewKeys", () => {
  it("renews every key under the same session and signs the renewal into the audit log", async () => {
    const s = server();
    const renewed = await renewKeys(s.api, opened, { ...input, companyId: company });
    if (!renewed.ok) throw new Error(renewed.error);
    const { value } = renewed;
    expect(value.opened.token).toBe("t-anna");
    expect(value.opened.accountKey).not.toEqual(anna.accountKey);
    expect(value.secretKey).not.toEqual(anna.secretKey);
    const [upload] = s.uploads as [RekeyUpload];
    const { proof, ...statement } = upload;
    expect(isSignedRekey(anna.keyBlock.ed.publicKey, proof, statement)).toBe(true);
    expect(upload.vaultKeys).toHaveLength(1);
    // What the offline copy keeps opens with the new passphrase keys and Recovery Key
    const reopened = unlockWithPassphrase(value.stored, PASSPHRASE, value.secretKey, quick);
    expect(reopened.ok && reopened.value.accountKey).toEqual(value.opened.accountKey);
    expect(unlockWithRecoveryKey(value.stored, value.recoveryKey).ok).toBe(true);
    const [event] = s.audits;
    expect(event?.action).toBe("account-rekey");
    const fields = [
      encodeBytes(company),
      encodeBytes(anna.accountId),
      "account-rekey",
      event?.subject as string,
    ];
    const signature = event?.signature as Uint8Array;
    expect(verify(value.opened.keyBlock.ed.publicKey, signature, "audit", ...fields)).toBe(true);
  });

  it("writes no audit entry without a company", async () => {
    const s = server();
    expect((await renewKeys(s.api, opened, input)).ok).toBe(true);
    expect(s.audits).toEqual([]);
  });

  it("sends nothing for a passphrase that does not open the account now", async () => {
    const s = server();
    expect(await renewKeys(s.api, opened, { ...input, passphrase: "Vertippt" })).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    const other = { ...opened, accountKey: new Uint8Array(32) };
    expect(await renewKeys(s.api, other, input)).toEqual({ ok: false, error: "wrong-passphrase" });
    expect(s.uploads).toEqual([]);
  });

  it("tries once more when another device wrote the state first, then gives up", async () => {
    const once = server(["stale", "ok"]);
    expect((await renewKeys(once.api, opened, input)).ok).toBe(true);
    expect(once.uploads).toHaveLength(2);
    const twice = server(["stale", "stale"]);
    expect(await renewKeys(twice.api, opened, input)).toEqual({ ok: false, error: "conflict" });
  });

  it("says why the server did not take it", async () => {
    expect(await renewKeys(server(["refused"]).api, opened, input)).toEqual({
      ok: false,
      error: "refused",
    });
    expect(await renewKeys(server(["unreachable"]).api, opened, input)).toEqual({
      ok: false,
      error: "unreachable",
    });
    const lost = server();
    lost.lose();
    expect(await renewKeys(lost.api, opened, input)).toEqual({ ok: false, error: "unreachable" });
  });

  it("refuses a state from the server that does not merge with its own", async () => {
    const s = server();
    const otherRoot = { ...opened, state: emptyState(new Uint8Array(32).fill(9)) };
    expect(await renewKeys(s.api, otherRoot, input)).toEqual({ ok: false, error: "damaged" });
  });
});
