import { ed25519KeyPair, passphraseKeysWith, rootFingerprint, seal } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { isCertified } from "../membership/certificate.ts";
import { createAccount, createCompany } from "./create.ts";
import { type AccountState, emptyState, mergeStates, openState, sealState } from "./state.ts";
import { type Stored, unlockWithPassphrase, unlockWithRecoveryKey } from "./unlock.ts";

const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const rootKey = ed25519KeyPair(new Uint8Array(32).fill(7));
const root = rootFingerprint(rootKey.publicKey);
const stored = (upload: ReturnType<typeof createAccount>["upload"]): Stored => upload;

describe("account state", () => {
  const state: AccountState = {
    rootFingerprint: root,
    bundles: { anna: new Uint8Array(32).fill(2) },
    logs: { buero: { seq: 3, hash: new Uint8Array(32).fill(3) } },
    versions: { bank: 2 },
    invitations: { einladung1: "anna" },
    certificates: { anna: 5, max: 9 },
    policy: 3,
    policyLock: 4,
    neverSave: ["portal.weber-haustechnik.test"],
    emergency: { jonas: { grant: 5, revoked: false, objected: 0 } },
    retiredRoots: [],
  };
  const key = new Uint8Array(32).fill(9);
  const account = new Uint8Array(16).fill(4);

  it("opens only under its key, account and counter", () => {
    const sealed = sealState(key, account, 5, state);
    expect(openState(key, account, 5, sealed)).toEqual({ ok: true, value: state });
    expect(openState(key, account, 4, sealed)).toEqual({ ok: false, error: "not-authentic" });
    expect(openState(key, new Uint8Array(16), 5, sealed)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    expect(openState(new Uint8Array(32), account, 5, sealed)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    const owner = { ...state, rootSecretKey: rootKey.secretKey };
    expect(openState(key, account, 0, sealState(key, account, 0, owner))).toEqual({
      ok: true,
      value: owner,
    });
  });

  it("refuses a sealed text that is no state", () => {
    const place = { purpose: "account-state", context: [account, 1] };
    for (const text of ["{", '{"rootFingerprint":"x"}'])
      expect(openState(key, account, 1, seal(key, new TextEncoder().encode(text), place))).toEqual({
        ok: false,
        error: "malformed",
      });
  });

  it("merges two devices' states: the higher of each, the known bundles kept", () => {
    const theirs: AccountState = {
      rootFingerprint: root,
      rootSecretKey: rootKey.secretKey,
      bundles: { max: new Uint8Array(32).fill(5) },
      logs: {
        buero: { seq: 2, hash: new Uint8Array(32).fill(8) },
        kunden: { seq: 1, hash: new Uint8Array(32).fill(6) },
      },
      versions: { bank: 3, mail: 1 },
      invitations: { einladung2: "max" },
      certificates: { anna: 7, max: 3, sandra: 1 },
      policy: 2,
      policyLock: 30,
      neverSave: ["sparkasse.test", "portal.weber-haustechnik.test"],
      emergency: {
        jonas: { grant: 5, revoked: true, objected: 3 },
        sandra: { grant: 2, revoked: false, objected: 0 },
      },
      retiredRoots: [],
    };
    expect(mergeStates(state, theirs)).toEqual({
      ok: true,
      value: {
        rootFingerprint: root,
        rootSecretKey: rootKey.secretKey,
        bundles: { anna: new Uint8Array(32).fill(2), max: new Uint8Array(32).fill(5) },
        logs: {
          buero: { seq: 3, hash: new Uint8Array(32).fill(3) },
          kunden: { seq: 1, hash: new Uint8Array(32).fill(6) },
        },
        versions: { bank: 3, mail: 1 },
        invitations: { einladung1: "anna", einladung2: "max" },
        certificates: { anna: 7, max: 9, sandra: 1 },
        policy: 3,
        policyLock: 4,
        neverSave: ["portal.weber-haustechnik.test", "sparkasse.test"],
        emergency: {
          jonas: { grant: 5, revoked: true, objected: 3 },
          sandra: { grant: 2, revoked: false, objected: 0 },
        },
        retiredRoots: [],
      },
    });
    expect(mergeStates(state, emptyState(root))).toEqual({ ok: true, value: state });
    expect(mergeStates(emptyState(root), state)).toEqual({ ok: true, value: state });
  });

  it("takes the longer log and the higher version from either side; the same place with another hash is refused", () => {
    const mine = { ...state, versions: { bank: 2, mail: 5 } };
    const theirs: AccountState = {
      ...emptyState(root),
      logs: { buero: { seq: 4, hash: new Uint8Array(32).fill(4) } },
      versions: { mail: 1 },
    };
    const merged = mergeStates(mine, theirs);
    expect(merged.ok && merged.value.logs).toEqual({
      buero: { seq: 4, hash: new Uint8Array(32).fill(4) },
    });
    expect(merged.ok && merged.value.versions).toEqual({ bank: 2, mail: 5 });
    const tie = mergeStates(state, {
      ...emptyState(root),
      logs: { buero: { seq: 3, hash: new Uint8Array(32).fill(9) } },
    });
    expect(tie).toEqual({ ok: false, error: "other-log" });
    const same = mergeStates(state, {
      ...emptyState(root),
      logs: { buero: { seq: 3, hash: new Uint8Array(32).fill(3) } },
    });
    expect(same.ok && same.value.logs).toEqual(state.logs);
  });

  it("refuses another root key or another bundle for a known account", () => {
    expect(mergeStates(state, emptyState(new Uint8Array(32)))).toEqual({
      ok: false,
      error: "other-root",
    });
    const swapped = {
      ...emptyState(root),
      bundles: { anna: new Uint8Array(32).fill(9) },
      certificates: state.certificates,
    };
    expect(mergeStates(state, swapped)).toEqual({ ok: false, error: "other-bundle" });
  });

  it("takes another bundle for a known account only with a newer certificate (P-12)", () => {
    const at = state.certificates.anna ?? 0;
    const renewed = {
      ...emptyState(root),
      bundles: { anna: new Uint8Array(32).fill(9) },
      certificates: { anna: at + 1 },
    };
    for (const merged of [mergeStates(state, renewed), mergeStates(renewed, state)])
      expect(merged.ok && merged.value.bundles.anna).toEqual(new Uint8Array(32).fill(9));
    const unseen = { ...state, certificates: {} };
    for (const merged of [mergeStates(unseen, renewed), mergeStates(renewed, unseen)])
      expect(merged.ok && merged.value.bundles.anna).toEqual(new Uint8Array(32).fill(9));
    const older = { ...renewed, certificates: { anna: at - 1 } };
    for (const merged of [mergeStates(state, older), mergeStates(older, state)])
      expect(merged.ok && merged.value.bundles.anna).toEqual(state.bundles.anna);
  });

  it("takes a bundle the own side does not know, and the same bundle again, whatever was seen", () => {
    const max = new Uint8Array(32).fill(7);
    const theirs = { ...emptyState(root), bundles: { max } };
    const merged = mergeStates(emptyState(root), theirs);
    expect(merged.ok && merged.value.bundles).toEqual({ max });
    expect(mergeStates(theirs, theirs)).toEqual({ ok: true, value: theirs });
  });

  it("keeps the personal vault's ID from either side, the own first (P-12)", () => {
    const theirs = { ...emptyState(root), personalVault: "theirs" };
    const mine = { ...state, personalVault: "mine" };
    const merged = mergeStates(state, theirs);
    expect(merged.ok && merged.value.personalVault).toBe("theirs");
    const both = mergeStates(mine, theirs);
    expect(both.ok && both.value.personalVault).toBe("mine");
    const none = mergeStates(state, emptyState(root));
    expect(none.ok && none.value).not.toHaveProperty("personalVault");
  });

  it("keeps the newer policy version and its lock time from either side", () => {
    const newer = { ...emptyState(root), policy: 7, policyLock: 2 };
    for (const merged of [mergeStates(state, newer), mergeStates(newer, state)])
      expect(merged.ok && [merged.value.policy, merged.value.policyLock]).toEqual([7, 2]);
    const same = { ...emptyState(root), policy: 3, policyLock: 50 };
    const mergedSame = mergeStates(state, same);
    expect(mergedSame.ok && mergedSame.value.policyLock).toBe(4);
    expect(
      mergeStates(state, newer).ok &&
        (mergeStates(state, newer) as { value: AccountState }).value.policy,
    ).toBe(7);
    expect(
      mergeStates(newer, state).ok &&
        (mergeStates(newer, state) as { value: AccountState }).value.policy,
    ).toBe(7);
  });

  it("refuses one invitation certified for two accounts, keeps it for the same one", () => {
    const other = { ...emptyState(root), invitations: { einladung1: "mallory" } };
    expect(mergeStates(state, other)).toEqual({ ok: false, error: "other-invitation" });
    const same = { ...emptyState(root), invitations: { einladung1: "anna" } };
    expect(mergeStates(state, same)).toEqual({ ok: true, value: state });
  });

  it("keeps every site either device never saves for, once and sorted (K-404)", () => {
    const theirs = { ...emptyState(root), neverSave: ["b.test", "a.test", "b.test"] };
    for (const merged of [mergeStates(state, theirs), mergeStates(theirs, state)])
      expect(merged.ok && merged.value.neverSave).toEqual([
        "a.test",
        "b.test",
        "portal.weber-haustechnik.test",
      ]);
    expect(emptyState(root).neverSave).toEqual([]);
  });

  it("reads a state written before invitations were remembered", () => {
    const {
      invitations: _,
      certificates: __,
      policy: ___,
      policyLock: ____,
      neverSave: _____,
      retiredRoots: ______,
      ...older
    } = state;
    const place = { purpose: "account-state", context: [account, 2] };
    const json = JSON.stringify({
      ...older,
      rootFingerprint: Buffer.from(root).toString("base64url"),
      bundles: { anna: "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI" },
      logs: { buero: { seq: 3, hash: "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM" } },
    });
    const opened = openState(key, account, 2, seal(key, new TextEncoder().encode(json), place));
    expect(opened).toEqual({
      ok: true,
      value: {
        ...state,
        invitations: {},
        certificates: {},
        policy: 0,
        policyLock: 10,
        neverSave: [],
        retiredRoots: [],
      },
    });
  });
});

describe("creating and unlocking an account", () => {
  const account = createAccount("Heizung-Wasser-Licht", emptyState(root), { derive: quick });

  it("unlocks with passphrase and Secret Key, and with the Recovery Key", () => {
    const expected = {
      ok: true,
      value: { accountKey: account.accountKey, keyBlock: account.keyBlock, state: account.state },
    };
    expect(
      unlockWithPassphrase(
        stored(account.upload),
        "Heizung-Wasser-Licht",
        account.secretKey,
        quick,
      ),
    ).toEqual(expected);
    expect(unlockWithRecoveryKey(stored(account.upload), account.recoveryKey)).toEqual(expected);
  });

  it("refuses a wrong passphrase, Secret Key or Recovery Key", () => {
    expect(
      unlockWithPassphrase(stored(account.upload), "falsch", account.secretKey, quick),
    ).toEqual({ ok: false, error: "wrong-key" });
    expect(
      unlockWithPassphrase(
        stored(account.upload),
        "Heizung-Wasser-Licht",
        new Uint8Array(16),
        quick,
      ),
    ).toEqual({
      ok: false,
      error: "wrong-key",
    });
    expect(unlockWithRecoveryKey(stored(account.upload), new Uint8Array(32))).toEqual({
      ok: false,
      error: "wrong-key",
    });
  });

  it("reports a key block or state swapped by the server as damaged", () => {
    const other = createAccount("anders", emptyState(root), { derive: quick });
    for (const swap of [
      { keyBlock: other.upload.keyBlock },
      { state: other.upload.state },
      { stateCounter: 1 },
    ])
      expect(
        unlockWithRecoveryKey({ ...stored(account.upload), ...swap }, account.recoveryKey),
      ).toEqual({
        ok: false,
        error: "damaged",
      });
  });

  it("uploads only IDs, salt, public keys and ciphertexts", () => {
    const { upload } = account;
    expect(Object.keys(upload).sort()).toEqual(
      [
        "accountId",
        "accountSalt",
        "edPublicKey",
        "keyBlock",
        "loginPublicKey",
        "recoveryLoginPublicKey",
        "state",
        "stateCounter",
        "unlock",
        "xwingPublicKey",
      ].sort(),
    );
    const sent = JSON.stringify(upload, (_, v) =>
      v instanceof Uint8Array ? Array.from(v).join(",") : v,
    );
    for (const secret of [
      account.accountKey,
      account.secretKey,
      account.recoveryKey,
      account.keyBlock.ed.secretKey,
    ])
      expect(sent.includes(Array.from(secret).join(","))).toBe(false);
    expect(upload.stateCounter).toBe(0);
    expect(account.accountId).toHaveLength(16);
    expect(upload.accountSalt).toHaveLength(16);
    expect(account.secretKey).toHaveLength(16);
  });
});

describe("creating a company", () => {
  it("makes the owner's account with the root key in its state and a certificate by that root", () => {
    const company = createCompany("Heizung-Wasser-Licht", {
      derive: quick,
      now: () => 1_800_000_000_000,
    });
    const { owner, certificate } = company;
    expect(owner.state.rootFingerprint).toEqual(rootFingerprint(company.rootPublicKey));
    expect(owner.state.rootSecretKey).toHaveLength(32);
    expect(owner.keyBlock.rootFingerprint).toEqual(owner.state.rootFingerprint);
    expect(isCertified(company.rootPublicKey, certificate)).toBe(true);
    expect(certificate).toMatchObject({
      accountId: owner.accountId,
      companyId: company.companyId,
      role: "owner",
      issuedAt: 1_800_000_000,
      edPublicKey: owner.keyBlock.ed.publicKey,
      xwingPublicKey: owner.keyBlock.xwing.publicKey,
    });
    expect(company.companyId).toHaveLength(16);
  });
});
