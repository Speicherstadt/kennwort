/**
 * The lock time while the popup is open and after (P-03): a timer in the popup and the browser's
 * lock alarm (auto-lock.ts) for when it is closed. Every use pushes both back; the alarm at most
 * every 15 seconds, the timer every time.
 */
import { LOCK_AFTER_MS } from "@kennwort/client/session/unlock.ts";
import { createSignal } from "solid-js";
import { type AlarmsApi, cancelLock, scheduleLock } from "./auto-lock.ts";

export const MINUTE = 60_000;
const ALARM_STEP_MS = 15_000;

export type LockTimerDeps = {
  alarms: AlarmsApi | undefined;
  now: () => number;
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (timer: unknown) => void;
};

export const createLockTimer = (deps: LockTimerDeps, onExpire: () => void) => {
  const [minutes, setMinutes] = createSignal(LOCK_AFTER_MS / MINUTE);
  let lockAfter = LOCK_AFTER_MS;
  let timer: unknown;
  let alarmSetAt = Number.NEGATIVE_INFINITY;
  const touch = () => {
    deps.cancel(timer);
    timer = deps.schedule(onExpire, lockAfter);
    if (deps.now() - alarmSetAt < ALARM_STEP_MS) return;
    alarmSetAt = deps.now();
    void scheduleLock(deps.alarms, lockAfter, alarmSetAt);
  };
  return {
    /** The lock time in minutes, for the footer */
    minutes,
    touch,
    /** A new lock time (the account state's, the company's); it counts from now on */
    start: (ms: number) => {
      lockAfter = ms;
      setMinutes(Math.round(ms / MINUTE));
      alarmSetAt = Number.NEGATIVE_INFINITY;
      touch();
    },
    stop: async () => {
      deps.cancel(timer);
      alarmSetAt = Number.NEGATIVE_INFINITY;
      await cancelLock(deps.alarms);
    },
  };
};
