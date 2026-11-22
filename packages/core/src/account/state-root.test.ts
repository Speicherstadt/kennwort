import { ed25519KeyPair, passphraseKeysWith, rootFingerprint } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createAccount } from "./create.ts";
import { type AccountState, emptyState, mergeStates, openState, sealState } from "./state.ts";
import { unlockWithAccountKey } from "./unlock.ts";

// Two devices of Jonas, one of which confirmed a new company root (K-307 part f, P-07)
const key = (byte: number) => ed25519KeyPair(new Uint8Array(32).fill(byte));
const first = key(1);
const second = key(2);
const third = key(3);
const fp = (k: { publicKey: Uint8Array }) => rootFingerprint(k.publicKey);
const retire = (from: typeof first, to: typeof first, until: number) => ({
  publicKey: from.publicKey,
  next: fp(to),
  until,
});

const before: AccountState = emptyState(fp(first), first.secretKey);
const after: AccountState = {
  ...emptyState(fp(second), second.secretKey),
  retiredRoots: [retire(first, second, 100)],
};

describe("merging states across a root change", () => {
  it("takes the confirmed root from either side, with the new private key only", () => {
    expect(mergeStates(before, after)).toEqual({ ok: true, value: after });
    expect(mergeStates(after, before)).toEqual({ ok: true, value: after });
  });

  it("drops the old root's private key when the other side confirmed the change", () => {
    const { rootSecretKey: _, ...member } = after;
    expect(mergeStates(before, member)).toEqual({ ok: true, value: member });
    expect(mergeStates(member, before)).toEqual({ ok: true, value: member });
  });

  it("keeps the private key of the pinned root when both sides pinned it", () => {
    const { rootSecretKey: _, ...without } = after;
    expect(mergeStates(without, after)).toEqual({ ok: true, value: after });
    expect(mergeStates(after, without)).toEqual({ ok: true, value: after });
  });

  it("follows two confirmed changes from a device that saw only the first", () => {
    const latest: AccountState = {
      ...emptyState(fp(third)),
      retiredRoots: [retire(first, second, 100), retire(second, third, 200)],
    };
    expect(mergeStates(after, latest)).toEqual({ ok: true, value: latest });
    expect(mergeStates(before, latest)).toEqual({ ok: true, value: latest });
  });

  it("refuses another root nobody confirmed and two successors of one root", () => {
    expect(mergeStates(before, emptyState(fp(second)))).toEqual({
      ok: false,
      error: "other-root",
    });
    const fork: AccountState = {
      ...emptyState(fp(third)),
      retiredRoots: [retire(first, third, 100)],
    };
    expect(mergeStates(after, fork)).toEqual({ ok: false, error: "other-root" });
    const otherTime = { ...after, retiredRoots: [retire(first, second, 101)] };
    expect(mergeStates(after, otherTime)).toEqual({ ok: false, error: "other-root" });
  });

  it("refuses a retired root that leads past both pinned roots", () => {
    const stale: AccountState = {
      ...emptyState(fp(first)),
      retiredRoots: [retire(second, third, 200)],
    };
    expect(mergeStates(stale, after)).toEqual({ ok: false, error: "other-root" });
  });

  it("keeps the confirmed changes through sealing and opening", () => {
    const key32 = new Uint8Array(32).fill(9);
    const account = new Uint8Array(16).fill(4);
    expect(openState(key32, account, 1, sealState(key32, account, 1, after))).toEqual({
      ok: true,
      value: after,
    });
  });
});

describe("unlocking after another device confirmed a new root", () => {
  const quick = (p: string, salt: Uint8Array, k: Uint8Array, account: Uint8Array) =>
    passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, k, account);
  const account = createAccount("Heizung-Wasser-Licht", emptyState(fp(first)), { derive: quick });
  const stored = (state: AccountState) => ({
    ...account.upload,
    state: sealState(account.accountKey, account.accountId, 0, state),
  });

  it("gives the key block the root the state confirmed, though the block was not written anew", () => {
    const opened = unlockWithAccountKey(account.accountKey, stored(after));
    expect(opened.ok && opened.value.keyBlock.rootFingerprint).toEqual(fp(second));
  });

  it("keeps the block's root while the state confirmed nothing", () => {
    const opened = unlockWithAccountKey(account.accountKey, stored(account.state));
    expect(opened.ok && opened.value.keyBlock).toEqual(account.keyBlock);
  });
});
