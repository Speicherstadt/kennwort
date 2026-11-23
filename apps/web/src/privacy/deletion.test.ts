import type { ServerDeletionPlan } from "@kennwort/client/session/privacy-api.ts";
import type { Loaded, Vault } from "@kennwort/client/vaults/vaults.ts";
import {
  changeAccess,
  createAccount,
  emptyState,
  encodeBytes,
  type LinkedCompanies,
  type LogEntry,
  linkCompany,
  newLinkPassphrase,
  verifyLog,
} from "@kennwort/core";
import { anna, jonas, log, logEntries, trust, vaultId } from "@kennwort/core/testing";
import { passphraseKeysWith } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type DeletionDeps, deleteAccount, type Home } from "./deletion.ts";

// K-607 (P-28): Jonas deletes his account; Müller Elektro is linked to it (K-605)
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const account = createAccount(PASSPHRASE, emptyState(new Uint8Array(32).fill(1)), {
  derive: quick,
});
const muellerId = new Uint8Array(16).fill(0x77);
const linked = linkCompany(
  {},
  muellerId,
  "Müller Elektro",
  { secretKey: new Uint8Array(16).fill(4), passphrase: newLinkPassphrase() },
  1,
) as LinkedCompanies;

const plan = (refused: ServerDeletionPlan["refused"] = null): ServerDeletionPlan => ({
  vaults: { drop: [], leave: [], await: [], "sole-manager": refused ? ["v"] : [] },
  refused,
});

/** Jonas manages the fixtures' vault; with `withAnna` Anna manages it too */
const loadedWith = (withAnna: boolean): Loaded => {
  const promote = changeAccess(
    { accountId: jonas.id, edSecretKey: jonas.ed.secretKey },
    log,
    vaultId,
    anna.id,
    { role: "manage", validUntil: 0 },
    1_800_000_010,
  );
  const entries: LogEntry[] = withAnna ? [...logEntries, promote] : logEntries;
  const state = verifyLog(vaultId, entries, trust);
  if (!state.ok) throw new Error(state.error);
  const vault = {
    idText: encodeBytes(vaultId),
    name: "Werkstatt",
    role: "manage",
    ring: { vaultId, epoch: 0, vaultKey: new Uint8Array(32) },
    older: [],
    log: state.value,
    entries,
  } as Vault;
  return { vaults: [vault], refused: [], people: [], trust, left: new Set() };
};

const homeOf = (loaded?: Loaded): Home => ({
  accountId: jonas.id,
  token: "t-jonas",
  secretKey: account.secretKey,
  edSecretKey: jonas.ed.secretKey,
  linked,
  loaded,
});

/** A server stand-in that records each call; plans and deletions as told */
const server = (opts: { plans?: Record<string, ServerDeletionPlan>; signIn?: boolean } = {}) => {
  const calls: string[] = [];
  const api: DeletionDeps["api"] = {
    // Jonas's own ciphertexts, so the passphrase check is the real one
    keys: async (token) => {
      calls.push(`keys:${token}`);
      return {
        accountId: account.accountId,
        accountSalt: account.upload.accountSalt,
        keyBlock: account.upload.keyBlock,
        state: account.upload.state,
        stateCounter: 0,
        unlock: account.upload.unlock,
      };
    },
    deletionPlan: async (token) => {
      calls.push(`plan:${token}`);
      return opts.plans?.[token] ?? plan();
    },
    signIn: async (accountId) => {
      calls.push(`sign-in:${encodeBytes(accountId)}`);
      return opts.signIn === false
        ? { ok: false, error: "denied" }
        : { ok: true, token: "t-mueller" };
    },
    deletionChallenge: async (token) => {
      calls.push(`challenge:${token}`);
      return {
        challengeId: `c-${token}`,
        challenge: new Uint8Array(32),
        accountSalt: new Uint8Array(16),
      };
    },
    deleteAccount: async (token) => {
      calls.push(`delete:${token}`);
      return { ok: true, company: false };
    },
    appendLog: async (token, entry) => {
      calls.push(`append:${token}:${entry.action}:${encodeBytes(entry.accountId)}`);
      return "ok";
    },
  };
  return { deps: { api, derive: quick }, calls };
};

describe("deleteAccount in the web app", () => {
  it("deletes the linked company first and the home last", async () => {
    const { deps, calls } = server();
    expect(await deleteAccount(deps, homeOf(), PASSPHRASE)).toEqual({ ok: true });
    expect(calls).toEqual([
      "keys:t-jonas",
      "plan:t-jonas",
      `sign-in:${encodeBytes(muellerId)}`,
      "plan:t-mueller",
      "challenge:t-mueller",
      "delete:t-mueller",
      "challenge:t-jonas",
      "delete:t-jonas",
    ]);
  });

  it("deletes nothing with a wrong passphrase", async () => {
    const { deps, calls } = server();
    expect(await deleteAccount(deps, homeOf(), "falsch")).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(calls).toEqual(["keys:t-jonas"]);
  });

  it("deletes nothing while the home or a linked company would be refused", async () => {
    const home = server({ plans: { "t-jonas": plan("last-owner") } });
    expect(await deleteAccount(home.deps, homeOf(), PASSPHRASE)).toEqual({
      ok: false,
      error: "last-owner",
      vaults: ["v"],
    });
    const mueller = server({ plans: { "t-mueller": plan("sole-manager") } });
    expect(await deleteAccount(mueller.deps, homeOf(), PASSPHRASE)).toEqual({
      ok: false,
      error: "sole-manager",
      vaults: ["v"],
      company: "Müller Elektro",
    });
    for (const calls of [home.calls, mueller.calls])
      expect(calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
  });

  it("deletes nothing when a linked company does not let the device in", async () => {
    const { deps, calls } = server({ signIn: false });
    expect(await deleteAccount(deps, homeOf(), PASSPHRASE)).toEqual({
      ok: false,
      error: "linked-unreachable",
      company: "Müller Elektro",
    });
    expect(calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
  });

  it("signs its own removal where Anna also manages, and none where it alone does", async () => {
    const shared = server();
    await deleteAccount(shared.deps, homeOf(loadedWith(true)), PASSPHRASE);
    const removal = `append:t-jonas:remove:${encodeBytes(jonas.id)}`;
    expect(shared.calls).toContain(removal);
    // Before the home's deletion, after the linked company's
    expect(shared.calls.indexOf(removal)).toBeGreaterThan(shared.calls.indexOf("delete:t-mueller"));
    expect(shared.calls.indexOf(removal)).toBeLessThan(shared.calls.indexOf("delete:t-jonas"));
    const alone = server();
    await deleteAccount(alone.deps, homeOf(loadedWith(false)), PASSPHRASE);
    expect(alone.calls.some((c) => c.startsWith("append:"))).toBe(false);
  });

  it("keeps the home when the server refuses its removal", async () => {
    const { deps, calls } = server();
    const refusing = { ...deps, api: { ...deps.api, appendLog: async () => "refused" as const } };
    expect(await deleteAccount(refusing, homeOf(loadedWith(true)), PASSPHRASE)).toEqual({
      ok: false,
      error: "removal-refused",
    });
    expect(calls).not.toContain("delete:t-jonas");
  });
});
