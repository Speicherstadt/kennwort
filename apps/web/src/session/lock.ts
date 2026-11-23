/**
 * The unlocked accounts in memory and the automatic lock (P-03), split from session.ts: locking
 * overwrites every account key it holds, so nothing usable lingers once the references are gone.
 */
import type { Opened } from "@kennwort/client/session/open-account.ts";
import { LOCK_AFTER_MS } from "@kennwort/client/session/unlock.ts";
import { encodeBytes } from "@kennwort/core";
import { createSignal } from "solid-js";

type LockDeps = {
  lockAfterMs?: number | undefined;
  schedule?: ((run: () => void, ms: number) => unknown) | undefined;
  cancel?: ((timer: unknown) => void) | undefined;
  now?: (() => number) | undefined;
};

/** Whether two open accounts are the same account */
const sameAccount = (a: Opened, b: Opened) => encodeBytes(a.accountId) === encodeBytes(b.accountId);

/** Overwrites an account's keys in memory (P-03) */
const wipe = (value: Opened | undefined) => {
  value?.accountKey.fill(0);
  value?.loginKey?.fill(0);
};

/**
 * The open account in memory and the automatic lock (P-03). The lock keeps its own copy of what is
 * open: a signal read right after its write still gives the old value until the next flush, and
 * the timer must start the moment an account opens (review of K-304). Besides the account on
 * screen it keeps the home account, the one unlocked with the passphrase: with several companies
 * (K-605, P-27) the account on screen may be another company's, and the way back is the home's.
 */
export const createLock = (deps: LockDeps, onLock: () => void = () => {}) => {
  const [opened, setOpenedSignal] = createSignal<Opened>();
  const [home, setHomeSignal] = createSignal<Opened>();
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = deps.cancel ?? ((timer) => clearTimeout(timer as number));
  const now = deps.now ?? Date.now;
  let timer: unknown;
  let lastUse = 0;
  let current: Opened | undefined;
  let homeNow: Opened | undefined;
  let lockAfter = deps.lockAfterMs ?? LOCK_AFTER_MS;
  const setHome = (value: Opened | undefined) => {
    homeNow = value;
    setHomeSignal(value);
  };
  /** The account on screen; a newer state of the home account is the home's too */
  const setOpened = (value: Opened | undefined) => {
    current = value;
    setOpenedSignal(value);
    if (value && homeNow && sameAccount(value, homeNow)) setHome(value);
  };
  const lock = () => {
    cancel(timer);
    wipe(current);
    wipe(homeNow);
    setHome(undefined);
    setOpened(undefined);
    onLock();
  };
  // Clamped to the lock time: Date.now follows the wall clock, and one set back would otherwise
  // put the last use in the future and keep the account open longer
  const scheduleLock = () => {
    cancel(timer);
    timer = schedule(lock, Math.min(lockAfter, Math.max(0, lastUse + lockAfter - now())));
  };
  /** Any use of the app pushes the automatic lock back */
  const touch = () => {
    if (!current) return;
    lastUse = now();
    scheduleLock();
  };
  /**
   * The company policy's lock time (K-304). It counts from the last use: the policy arrives a
   * moment after unlocking, and its arrival is no use of the app (a slow server would otherwise
   * keep an idle account open longer); an account idle for longer than the new time locks at once
   */
  const setLockAfter = (ms: number) => {
    lockAfter = ms;
    if (current) scheduleLock();
  };
  // Another account opened while one is unlocked (setup or invitation) drops the first one properly
  const open = (value: Opened) => {
    lock();
    setHome(value);
    setOpened(value);
    touch();
  };
  /**
   * Another company of the home account on screen (K-605): the company's account that was on
   * screen is wiped, the home stays open in memory
   */
  const switchTo = (value: Opened) => {
    if (current && homeNow && !sameAccount(current, homeNow)) wipe(current);
    setOpened(value);
    touch();
  };
  return { opened, home, setOpened, lock, touch, open, switchTo, setLockAfter };
};
