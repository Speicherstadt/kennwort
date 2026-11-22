import { ed25519KeyPair, newKeyBlock, rootFingerprint, signRootChange } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { emptyState } from "../account/state.ts";
import {
  acceptRootChange,
  followRoot,
  type RetiredRoot,
  rootOf,
  type ServedRoot,
  successorOf,
} from "./root-change.ts";
import { CLOCK_SKEW_SECONDS } from "./verify-log.ts";

// Weber Haustechnik: Sandra, an admin, left; Jonas replaced the root (K-307 part f, P-07)
const key = (byte: number) => ed25519KeyPair(new Uint8Array(32).fill(byte));
const company = new Uint8Array(16).fill(0xc0);
const first = key(1);
const second = key(2);
const third = key(3);
const sandras = key(9);
const fp = (k: { publicKey: Uint8Array }) => rootFingerprint(k.publicKey);
const NOW = 1_800_000_000;
const change = (from = first, to = second, time = NOW - 100, companyId = company) =>
  signRootChange(from.secretKey, to.secretKey, companyId, time);
const served = (root: Uint8Array | null, rootChanges = [change()]): ServedRoot => ({
  companyId: company,
  rootPublicKey: root,
  rootChanges,
});
const pinned = (root = first) => emptyState(fp(root), root.secretKey);
const retiredFirst: RetiredRoot = {
  publicKey: first.publicKey,
  next: fp(second),
  until: NOW - 100,
};
const confirmed = { ...emptyState(fp(second)), retiredRoots: [retiredFirst] };

describe("the root the server serves (rootOf)", () => {
  it("counts when it is the pinned one", () => {
    expect(rootOf(pinned(), served(first.publicKey, []), NOW)).toEqual({
      kind: "current",
      root: first.publicKey,
    });
    expect(rootOf(confirmed, served(second.publicKey), NOW)).toEqual({
      kind: "current",
      root: second.publicKey,
    });
  });

  it("waits for the person when a signed change leads there from the pinned root", () => {
    expect(rootOf(pinned(), served(second.publicKey), NOW)).toEqual({
      kind: "change",
      changes: [change()],
      fingerprint: fp(second),
    });
  });

  it("follows a chain of changes, oldest first, served in any order", () => {
    const next = change(second, third, NOW - 50);
    expect(rootOf(pinned(), served(third.publicKey, [next, change()]), NOW)).toEqual({
      kind: "change",
      changes: [change(), next],
      fingerprint: fp(third),
    });
  });

  it("takes the served root when the server sends no changes at all", () => {
    const { rootChanges: _, ...withoutChanges } = served(first.publicKey);
    expect(rootOf(pinned(), withoutChanges, NOW)).toEqual({
      kind: "current",
      root: first.publicKey,
    });
  });

  it("follows two changes of the same second", () => {
    const next = change(second, third, NOW - 100);
    expect(rootOf(pinned(), served(third.publicKey, [change(), next]), NOW)).toMatchObject({
      kind: "change",
      changes: [change(), next],
    });
  });

  it("ends a loop of changes that never reaches the served root", () => {
    // Of the same second, so only the length of the chain ends the walk
    const back = change(second, first, NOW - 100);
    expect(rootOf(pinned(), served(third.publicKey, [change(), back]), NOW)).toEqual({
      kind: "refused",
      error: "root-mismatch",
    });
  });

  it("refuses a chain whose times go back", () => {
    const earlier = change(second, third, NOW - 200);
    expect(rootOf(pinned(), served(third.publicKey, [change(), earlier]), NOW)).toEqual({
      kind: "refused",
      error: "root-mismatch",
    });
  });

  it("refuses no root, a root without changes, and changes that do not reach it", () => {
    const mismatch = { kind: "refused", error: "root-mismatch" };
    expect(rootOf(pinned(), served(null), NOW)).toEqual(mismatch);
    expect(rootOf(pinned(), served(second.publicKey, []), NOW)).toEqual(mismatch);
    expect(rootOf(pinned(), served(third.publicKey), NOW)).toEqual(mismatch);
  });

  it("takes no change of another company, from the future or with a broken signature", () => {
    const mismatch = { kind: "refused", error: "root-mismatch" };
    const other = change(first, second, NOW - 100, new Uint8Array(16).fill(0xd0));
    expect(rootOf(pinned(), served(second.publicKey, [other]), NOW)).toEqual(mismatch);
    const ahead = change(first, second, NOW + CLOCK_SKEW_SECONDS + 1);
    expect(rootOf(pinned(), served(second.publicKey, [ahead]), NOW)).toEqual(mismatch);
    const atSkew = change(first, second, NOW + CLOCK_SKEW_SECONDS);
    expect(rootOf(pinned(), served(second.publicKey, [atSkew]), NOW).kind).toBe("change");
    const broken = { ...change(), time: NOW - 99 };
    expect(rootOf(pinned(), served(second.publicKey, [broken]), NOW)).toEqual(mismatch);
  });

  it("refuses a second change from a root this account confirmed replaced (fork)", () => {
    const sandrasChange = change(first, sandras);
    expect(rootOf(confirmed, served(sandras.publicKey, [sandrasChange]), NOW)).toEqual({
      kind: "refused",
      error: "root-fork",
    });
    // Even beside the right root: the old root signed twice
    expect(rootOf(confirmed, served(second.publicKey, [change(), sandrasChange]), NOW)).toEqual({
      kind: "refused",
      error: "root-fork",
    });
  });

  it("refuses two changes from the pinned root before any is confirmed", () => {
    const sandrasChange = change(first, sandras);
    for (const root of [second, sandras])
      expect(rootOf(pinned(), served(root.publicKey, [change(), sandrasChange]), NOW)).toEqual({
        kind: "refused",
        error: "root-fork",
      });
  });

  it("does not call an unsigned second change a fork", () => {
    const forged = { ...change(first, sandras), oldSignature: change().oldSignature };
    expect(rootOf(confirmed, served(second.publicKey, [change(), forged]), NOW).kind).toBe(
      "current",
    );
  });

  it("refuses a root this account replaced, which the server keeps alive", () => {
    expect(rootOf(confirmed, served(first.publicKey, []), NOW)).toEqual({
      kind: "refused",
      error: "root-retired",
    });
  });
});

describe("confirming a change (acceptRootChange)", () => {
  it("pins the new root, retires the old one with its time and drops its private key", () => {
    expect(acceptRootChange(pinned(), [change()])).toEqual({
      ...emptyState(fp(second)),
      retiredRoots: [retiredFirst],
    });
  });

  it("keeps the new private key of the rotating owner", () => {
    expect(acceptRootChange(pinned(), [change()], second.secretKey)).toEqual({
      ...emptyState(fp(second), second.secretKey),
      retiredRoots: [retiredFirst],
    });
  });

  it("retires every root of a chain", () => {
    const next = change(second, third, NOW - 50);
    expect(acceptRootChange(pinned(), [change(), next])?.retiredRoots).toEqual([
      retiredFirst,
      { publicKey: second.publicKey, next: fp(third), until: NOW - 50 },
    ]);
  });

  it("takes nothing that does not start at the pinned root, and no empty chain", () => {
    expect(acceptRootChange(confirmed, [change()])).toBeUndefined();
    expect(acceptRootChange(pinned(), [])).toBeUndefined();
    expect(acceptRootChange(pinned(), [change(second, third)])).toBeUndefined();
  });
});

describe("the root a chain of confirmed changes leads to (successorOf)", () => {
  const chain: RetiredRoot[] = [
    { publicKey: second.publicKey, next: fp(third), until: 2 },
    retiredFirst,
  ];
  it("walks the chain from any of its roots", () => {
    expect(successorOf(chain, fp(first))).toEqual(fp(third));
    expect(successorOf(chain, fp(second))).toEqual(fp(third));
    expect(successorOf(chain, fp(third))).toEqual(fp(third));
    expect(successorOf([], fp(first))).toEqual(fp(first));
  });

  it("stops on a loop", () => {
    const loop = [retiredFirst, { publicKey: second.publicKey, next: fp(first), until: 3 }];
    // One step per retired root: around the loop once, back where it started
    expect(successorOf(loop, fp(first))).toEqual(fp(first));
  });
});

describe("the key block's root (followRoot)", () => {
  const block = newKeyBlock(fp(first));

  it("follows a confirmed chain from the block's root to the pinned one", () => {
    expect(followRoot(block, confirmed)).toEqual({ ...block, rootFingerprint: fp(second) });
  });

  it("stays when it is the pinned root or no confirmed chain leads there", () => {
    expect(followRoot(block, pinned())).toBe(block);
    expect(followRoot(block, emptyState(fp(second)))).toBe(block);
    const newer = newKeyBlock(fp(second));
    expect(followRoot(newer, emptyState(fp(first)))).toBe(newer);
  });
});
