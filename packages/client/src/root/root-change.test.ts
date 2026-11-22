import {
  type AccountState,
  certify,
  createAccount,
  emptyState,
  encodeBytes,
  KEY_BLOCK_PURPOSE,
  keyBlockFields,
  type RootRotation,
  type Stored,
} from "@kennwort/core";
import {
  comparisonCode,
  ed25519KeyPair,
  openKeyBlock,
  passphraseKeysWith,
  type RootChange,
  rootFingerprint,
  signRootChange,
  verify,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { StateWrite } from "../session/members-api.ts";
import { type Opened, stateUpdater } from "../session/open-account.ts";
import { confirmRootChange, loadRoot, type RootDeps, replaceRoot } from "./root-change.ts";

// Weber Haustechnik after Sandra, an admin, left: Jonas replaces the root, Anna confirms it
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const companyId = new Uint8Array(16).fill(0xc0);
const pin = rootFingerprint(root.publicKey);

const accountOf = (rootSecretKey?: Uint8Array) =>
  createAccount("Heizung-Wasser-Licht-Kupfer", emptyState(pin, rootSecretKey), { derive: quick });
const certificateOf = (a: ReturnType<typeof accountOf>, role: "owner" | "member") =>
  certify(root.secretKey, {
    accountId: a.accountId,
    xwingPublicKey: a.keyBlock.xwing.publicKey,
    edPublicKey: a.keyBlock.ed.publicKey,
    companyId,
    role,
    issuedAt: 1_000,
  });

/** The server as far as these calls go: company, members, the account's state and key block */
const serverFor = (account: ReturnType<typeof accountOf>, accept = true) => {
  const jonas = account;
  const company = {
    rootPublicKey: root.publicKey as Uint8Array,
    rootChanges: [] as RootChange[],
    policy: null as RootRotation["policy"] | null,
  };
  const rows = [{ account: jonas, certificate: certificateOf(jonas, "owner") }];
  let stored: Stored = { ...account.upload };
  const blocks: Uint8Array[] = [];
  const api: RootDeps = {
    company: async () => ({
      id: encodeBytes(companyId),
      rootPublicKey: company.rootPublicKey,
      policy: company.policy,
      recoveryPublicKey: null,
      rootChanges: company.rootChanges,
    }),
    members: async () =>
      rows.map(({ account: a, certificate }) => ({
        id: a.accountId,
        role: certificate.role,
        name: null,
        xwingPublicKey: certificate.xwingPublicKey,
        edPublicKey: certificate.edPublicKey,
        certificate,
        invitation: null,
      })),
    replaceRoot: async (_token, rotation) => {
      if (!accept) return false;
      company.rootPublicKey = rotation.change.newRootPublicKey;
      company.rootChanges.push(rotation.change);
      company.policy = rotation.policy;
      return true;
    },
    // As the real server: only with the account's own signature over the block (found in review)
    writeKeyBlock: async (_token, sealed, proof) => {
      const fields = keyBlockFields(encodeBytes(account.accountId), sealed);
      if (!verify(account.keyBlock.ed.publicKey, proof, KEY_BLOCK_PURPOSE, ...fields)) return false;
      blocks.push(sealed);
      return true;
    },
    keys: async () => stored,
    writeState: async (_token, sealed, counter): Promise<StateWrite> => {
      if (counter !== stored.stateCounter + 1) return { ok: false, stale: true };
      stored = { ...stored, state: sealed, stateCounter: counter };
      return { ok: true };
    },
  };
  return { api, company, blocks };
};

const openAccount = (
  account: ReturnType<typeof accountOf>,
  state: AccountState = account.state,
) => {
  let opened: Opened | undefined = {
    accountId: account.accountId,
    accountKey: account.accountKey,
    keyBlock: account.keyBlock,
    state,
    token: "t",
  };
  const current = () => opened;
  return { opened: current, updateState: stateUpdater(current, (v) => (opened = v)) };
};

const blockRoot = (account: ReturnType<typeof accountOf>, sealed: Uint8Array | undefined) => {
  const block = openKeyBlock(account.accountKey, account.accountId, sealed ?? new Uint8Array());
  return block.ok ? block.value.rootFingerprint : undefined;
};

describe("an owner replaces the root (replaceRoot)", () => {
  it("sends the rotation, pins the new root here and writes the key block anew", async () => {
    const jonas = accountOf(root.secretKey);
    const { api, company, blocks } = serverFor(jonas);
    const session = openAccount(jonas);
    const done = await replaceRoot(api, session);
    const newPin = rootFingerprint(company.rootPublicKey);
    expect(done).toEqual({ ok: true, value: comparisonCode(newPin) });
    const state = session.opened()?.state as AccountState;
    expect(state.rootFingerprint).toEqual(newPin);
    expect(ed25519KeyPair(state.rootSecretKey).publicKey).toEqual(company.rootPublicKey);
    expect(state.retiredRoots).toEqual([
      { publicKey: root.publicKey, next: newPin, until: company.rootChanges[0]?.time },
    ]);
    expect(state.certificates[encodeBytes(jonas.accountId)]).toBeGreaterThan(1_000);
    expect(state.policy).toBe(1);
    expect(session.opened()?.keyBlock.rootFingerprint).toEqual(newPin);
    expect(blockRoot(jonas, blocks[0])).toEqual(newPin);
  });

  it("changes nothing without the root key, when the server refuses or serves another root", async () => {
    const anna = accountOf();
    expect(await replaceRoot(serverFor(anna).api, openAccount(anna))).toEqual({
      ok: false,
      error: "no-root",
    });
    const jonas = accountOf(root.secretKey);
    const refusing = serverFor(jonas, false);
    const session = openAccount(jonas);
    expect(await replaceRoot(refusing.api, session)).toEqual({ ok: false, error: "refused" });
    expect(session.opened()?.state).toEqual(jonas.state);
    const other = serverFor(jonas);
    other.company.rootPublicKey = ed25519KeyPair().publicKey;
    expect(await replaceRoot(other.api, session)).toEqual({ ok: false, error: "untrusted" });
    expect(other.blocks).toEqual([]);
  });

  it("refuses when the server is away or the policy does not check out", async () => {
    const jonas = accountOf(root.secretKey);
    const away = serverFor(jonas);
    expect(
      await replaceRoot({ ...away.api, members: async () => undefined }, openAccount(jonas)),
    ).toEqual({ ok: false, error: "unreachable" });
    const seen = { ...jonas.state, policy: 3 };
    expect(await replaceRoot(serverFor(jonas).api, openAccount(jonas, seen))).toEqual({
      ok: false,
      error: "untrusted",
    });
  });
});

describe("a member confirms the change (confirmRootChange)", () => {
  const next = ed25519KeyPair(new Uint8Array(32).fill(2));
  const change = signRootChange(root.secretKey, next.secretKey, companyId, 1_700_000_000);

  it("sees the change waiting, confirms it and writes the key block anew", async () => {
    const anna = accountOf();
    const { api, company, blocks } = serverFor(anna);
    company.rootPublicKey = next.publicKey;
    company.rootChanges.push(change);
    const session = openAccount(anna);
    const view = await loadRoot(api, session.opened() as Opened);
    expect(view).toEqual({
      kind: "change",
      changes: [change],
      fingerprint: rootFingerprint(next.publicKey),
    });
    expect(await confirmRootChange(api, session, [change])).toBe(true);
    expect(await loadRoot(api, session.opened() as Opened)).toEqual({
      kind: "current",
      root: next.publicKey,
    });
    expect(blockRoot(anna, blocks[0])).toEqual(rootFingerprint(next.publicKey));
  });

  it("writes nothing for a change that does not start at the pinned root", async () => {
    const anna = accountOf();
    const { api, blocks } = serverFor(anna);
    const elsewhere = signRootChange(next.secretKey, root.secretKey, companyId, 1_700_000_000);
    expect(await confirmRootChange(api, openAccount(anna), [elsewhere])).toBe(false);
    expect(blocks).toEqual([]);
  });

  it("knows nothing while the server is away", async () => {
    const anna = accountOf();
    const { api } = serverFor(anna);
    const away = { ...api, company: async () => undefined };
    expect(await loadRoot(away, openAccount(anna).opened() as Opened)).toBeUndefined();
  });
});
