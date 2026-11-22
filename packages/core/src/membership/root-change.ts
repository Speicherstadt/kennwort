/**
 * A new company root key on the client (K-307 part f, P-07, F-14). The server serves the root and
 * the chain of changes that led to it; the client decides:
 *
 * - the served root is the pinned one: it counts;
 * - a chain of changes, each signed by its old and its new root for this company, leads from the
 *   pinned root to the served one: a change waits until the person compares the new root's code
 *   with an owner and confirms it. Whoever left kept the old root and could sign a change of their
 *   own, so no change counts by its signature alone;
 * - a second change from a root this account has seen replaced, or two changes from one root: a
 *   fork, refused; the served root is one this account replaced: the server keeps it alive, refused.
 *
 * The confirmed changes stay in the account state (`retiredRoots`): with them every device of the
 * account follows the change, and certificates of a replaced root count only for what was signed
 * before its change (verify-log.ts).
 */
import {
  constantTimeEqual,
  isSignedRootChange,
  type KeyBlock,
  type RootChange,
  rootFingerprint,
} from "@kennwort/crypto";
import { z } from "zod";
import type { AccountState } from "../account/state.ts";
import { bytes } from "../sync/bytes.ts";
import { CLOCK_SKEW_SECONDS } from "./verify-log.ts";

export const RootChangeWire = z.object({
  companyId: bytes(16),
  oldRootPublicKey: bytes(32),
  newRootPublicKey: bytes(32),
  time: z.number().int().nonnegative(),
  oldSignature: bytes(65),
  newSignature: bytes(65),
});

/** A root this account replaced after a person confirmed the change: the key, its successor, when */
export type RetiredRoot = { publicKey: Uint8Array; next: Uint8Array; until: number };

export type RootError = "root-mismatch" | "root-fork" | "root-retired";

export type RootView =
  | { kind: "current"; root: Uint8Array }
  /** Changes from the pinned root to the served one, oldest first, waiting for the person */
  | { kind: "change"; changes: RootChange[]; fingerprint: Uint8Array }
  | { kind: "refused"; error: RootError };

type Pinned = Pick<AccountState, "rootFingerprint" | "retiredRoots">;
export type ServedRoot = {
  companyId: Uint8Array;
  rootPublicKey: Uint8Array | null;
  rootChanges?: readonly RootChange[] | undefined;
};

const same = constantTimeEqual;
const oldOf = (change: RootChange) => rootFingerprint(change.oldRootPublicKey);
const newOf = (change: RootChange) => rootFingerprint(change.newRootPublicKey);

/** The root that a chain of confirmed changes leads to from this one (itself if none) */
export const successorOf = (retired: readonly RetiredRoot[], from: Uint8Array) => {
  let current = from;
  // Each step retires one root, so a chain is never longer than the list
  for (let step = 0; step < retired.length; step++) {
    const found = retired.find((r) => same(rootFingerprint(r.publicKey), current));
    if (!found) break;
    current = found.next;
  }
  return current;
};

const isRetired = (pinned: Pinned, fingerprint: Uint8Array) =>
  pinned.retiredRoots.some((r) => same(rootFingerprint(r.publicKey), fingerprint));

/**
 * Whether some change starts at a root that another change, or one this account confirmed, takes
 * elsewhere: the old root signed twice (P-07)
 */
const isForked = (pinned: Pinned, changes: readonly RootChange[]) =>
  changes.some((change) => {
    const from = oldOf(change);
    const to = newOf(change);
    const confirmed = pinned.retiredRoots.find((r) => same(rootFingerprint(r.publicKey), from));
    if (confirmed && !same(confirmed.next, to)) return true;
    return changes.some((other) => same(oldOf(other), from) && !same(newOf(other), to));
  });

/** The changes from one root to another, oldest first, with times that never go back */
const chainOf = (from: Uint8Array, to: Uint8Array, changes: readonly RootChange[]) => {
  const chain: RootChange[] = [];
  let current = from;
  let time = 0;
  while (!same(current, to)) {
    const next = changes.find((c) => same(oldOf(c), current) && c.time >= time);
    if (!next || chain.length === changes.length) return undefined;
    chain.push(next);
    current = newOf(next);
    time = next.time;
  }
  return chain;
};

/** What the client makes of the root the server serves (see the top of this file) */
export const rootOf = (pinned: Pinned, served: ServedRoot, now: number): RootView => {
  if (!served.rootPublicKey) return { kind: "refused", error: "root-mismatch" };
  const changes = (served.rootChanges ?? []).filter(
    (c) =>
      same(c.companyId, served.companyId) &&
      c.time <= now + CLOCK_SKEW_SECONDS &&
      isSignedRootChange(c),
  );
  if (isForked(pinned, changes)) return { kind: "refused", error: "root-fork" };
  const fingerprint = rootFingerprint(served.rootPublicKey);
  if (same(fingerprint, pinned.rootFingerprint))
    return { kind: "current", root: served.rootPublicKey };
  if (isRetired(pinned, fingerprint)) return { kind: "refused", error: "root-retired" };
  const chain = chainOf(pinned.rootFingerprint, fingerprint, changes);
  return chain
    ? { kind: "change", changes: chain, fingerprint }
    : { kind: "refused", error: "root-mismatch" };
};

/**
 * The account state once the person confirmed the changes: the new root pinned, each old one
 * retired with its successor and time, the old root's private key gone. The rotating owner passes
 * the new private key. Undefined when the changes do not start at the pinned root (another device
 * of the account confirmed something else meanwhile).
 */
export const acceptRootChange = (
  state: AccountState,
  changes: readonly RootChange[],
  rootSecretKey?: Uint8Array,
): AccountState | undefined => {
  const target = changes.at(-1);
  const chain = (target && chainOf(state.rootFingerprint, newOf(target), changes)) || [];
  const end = chain.at(-1);
  if (!end) return undefined;
  const { rootSecretKey: _, ...rest } = state;
  return {
    ...rest,
    ...(rootSecretKey ? { rootSecretKey } : {}),
    rootFingerprint: newOf(end),
    retiredRoots: [
      ...state.retiredRoots,
      ...chain.map((c) => ({ publicKey: c.oldRootPublicKey, next: newOf(c), until: c.time })),
    ],
  };
};

/**
 * The key block with the root the account state pinned, when a confirmed chain leads there from
 * the block's own: another device of the account confirmed the change and the block on the server
 * was not written anew yet (P-07)
 */
export const followRoot = (keyBlock: KeyBlock, state: Pinned): KeyBlock =>
  !same(keyBlock.rootFingerprint, state.rootFingerprint) &&
  same(successorOf(state.retiredRoots, keyBlock.rootFingerprint), state.rootFingerprint)
    ? { ...keyBlock, rootFingerprint: state.rootFingerprint }
    : keyBlock;
