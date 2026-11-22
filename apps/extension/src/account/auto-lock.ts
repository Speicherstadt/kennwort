/**
 * The automatic lock of the extension (P-03): the popup lives only while it is open, so the lock
 * time is an alarm of the browser. The popup sets it when the account opens and pushes it back on
 * every use; when it rings, the service worker clears the unlocked keys from the session area
 * (background.ts). A popup that opens after the time ran out finds no alarm and locks as well.
 */
import { clearUnlocked, type SessionArea } from "../session-keys.ts";

export const LOCK_ALARM = "kennwort-lock";

/** The part of chrome.alarms this needs; tests pass a fake */
export type AlarmsApi = {
  create(name: string, info: { when: number }): Promise<void> | void;
  get(name: string): Promise<{ scheduledTime: number } | undefined>;
  clear(name: string): Promise<boolean>;
  /** Only the service worker listens */
  onAlarm?: { addListener(listener: (alarm: { name: string }) => void): void };
};

export const browserAlarms = (): AlarmsApi | undefined =>
  (globalThis as { chrome?: { alarms?: AlarmsApi } }).chrome?.alarms;

/** The lock rings `afterMs` from now, replacing an earlier time */
export const scheduleLock = async (alarms: AlarmsApi | undefined, afterMs: number, now: number) => {
  await alarms?.create(LOCK_ALARM, { when: now + afterMs });
};

export const cancelLock = async (alarms: AlarmsApi | undefined) => {
  await alarms?.clear(LOCK_ALARM).catch(() => false);
};

/**
 * Whether the keys in the session area may still be used: only while the lock alarm is set and
 * has not rung. Without the alarm API nothing can lock the keys later, so they count as expired.
 */
export const lockStillAhead = async (alarms: AlarmsApi | undefined, now: number) => {
  if (!alarms) return false;
  const alarm = await alarms.get(LOCK_ALARM).catch(() => undefined);
  return alarm !== undefined && alarm.scheduledTime > now;
};

/** The service worker's half: when the lock alarm rings, the unlocked keys and the alert list go */
export const lockOnAlarm = async (area: SessionArea | undefined, alarm: { name: string }) => {
  if (alarm.name !== LOCK_ALARM) return;
  await clearUnlocked(area);
};
