/**
 * The open account in chrome.storage.session (session-keys.ts, records.ts): kept after an unlock,
 * read back when the popup opens again. Keys go only into an area closed to content scripts, and
 * only with the lock alarm set, so they never outlive the lock time.
 */
import type { Api } from "@kennwort/client/session/api.ts";
import type { Opened } from "@kennwort/client/session/open-account.ts";
import { unlockWithAccountKey } from "@kennwort/core";
import {
  createSessionKeys,
  DEVICE_ITEM,
  restrictToTrustedContexts,
  type SessionArea,
} from "../session-keys.ts";
import { type AlarmsApi, lockStillAhead, scheduleLock } from "./auto-lock.ts";
import { MINUTE } from "./lock-timer.ts";
import {
  type DeviceRecord,
  deviceFromKeys,
  deviceToKeys,
  unlockedFromKeys,
  unlockedToKeys,
} from "./records.ts";

export const createUnlockedStore = (
  area: SessionArea | undefined,
  alarms: AlarmsApi | undefined,
) => {
  const keys = createSessionKeys(area);
  const device = createSessionKeys(area, DEVICE_ITEM);
  return {
    /** Device and keys after an unlock; false when they could not be kept safely */
    keep: async (record: DeviceRecord, opened: Opened, now: number) => {
      if (!(await restrictToTrustedContexts(area)).ok) return false;
      // Set before the keys go in: without it the next popup would refuse them
      await scheduleLock(alarms, opened.state.policyLock * MINUTE, now);
      const unlocked = { accountKey: opened.accountKey, token: opened.token };
      const stored = await Promise.all([
        device.store(deviceToKeys(record)),
        keys.store(unlockedToKeys(unlocked)),
      ]);
      return stored.every((result) => result.ok);
    },
    readDevice: async () => {
      const read = await device.read();
      return read.ok && read.value ? deviceFromKeys(read.value) : undefined;
    },
    /** The account of an earlier popup, while the lock alarm has not rung and the server knows it */
    reopen: async (record: DeviceRecord, api: Api, now: number): Promise<Opened | undefined> => {
      const read = await keys.read();
      const unlocked = read.ok && read.value ? unlockedFromKeys(read.value) : undefined;
      if (!unlocked || !(await lockStillAhead(alarms, now))) return undefined;
      const stored = await api.keys(unlocked.token);
      if (!stored) return undefined;
      const opening = unlockWithAccountKey(unlocked.accountKey, stored);
      if (!opening.ok) return undefined;
      return { ...opening.value, accountId: record.accountId, token: unlocked.token };
    },
    clearKeys: () => keys.clear(),
    clearDevice: () => device.clear(),
  };
};
