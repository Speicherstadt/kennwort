/**
 * The open account in chrome.storage.session (session-keys.ts, records.ts): kept after an unlock,
 * read back when the popup opens again. Keys go only into an area closed to content scripts, and
 * only with the lock alarm set, so they never outlive the lock time. The account state this device
 * saw or wrote is kept as well, sealed under AK, and merged into whatever the server serves: a
 * server that plays back an older one cannot throw the device back (E-07, E-13; review of K-402).
 */
import type { Api } from "@kennwort/client/session/api.ts";
import type { Opened } from "@kennwort/client/session/open-account.ts";
import type { KeptState } from "@kennwort/client/session/state-sync.ts";
import {
  type AccountState,
  mergeStates,
  openState,
  type Stored,
  sealState,
  unlockWithAccountKey,
} from "@kennwort/core";
import {
  clearUnlocked,
  createSessionKeys,
  DEVICE_ITEM,
  restrictToTrustedContexts,
  type SessionArea,
  STATE_ITEM,
} from "../session-keys.ts";
import { type AlarmsApi, lockStillAhead, scheduleLock } from "./auto-lock.ts";
import { MINUTE } from "./lock-timer.ts";
import {
  type DeviceRecord,
  deviceFromKeys,
  deviceToKeys,
  keptFromKeys,
  keptToKeys,
  unlockedFromKeys,
  unlockedToKeys,
} from "./records.ts";

/**
 * Both states merged, the higher of each. A conflict (another root, bundle or log hash) means the
 * server showed something else than this device checked: the device keeps its own, as the web app
 * does with its offline copy (apps/web/src/session/offline-unlock.ts)
 */
const merged = (mine: AccountState, served: AccountState) => {
  const both = mergeStates(mine, served);
  return both.ok ? both.value : mine;
};

export const createUnlockedStore = (
  area: SessionArea | undefined,
  alarms: AlarmsApi | undefined,
) => {
  const keys = createSessionKeys(area);
  const device = createSessionKeys(area, DEVICE_ITEM);
  const state = createSessionKeys(area, STATE_ITEM);
  const readKept = async () => {
    const read = await state.read();
    return read.ok && read.value ? keptFromKeys(read.value) : undefined;
  };
  const keepState = async (kept: KeptState) => (await state.store(keptToKeys(kept))).ok;

  /**
   * The served state with the kept one merged in, kept again under the higher counter; a kept
   * state of another account or a damaged one does not open and is replaced
   */
  const withKept = async (opened: Opened, served: Stored): Promise<Opened> => {
    const kept = await readKept();
    const mine = kept && openState(opened.accountKey, opened.accountId, kept.counter, kept.sealed);
    const value = mine?.ok ? merged(mine.value, opened.state) : opened.state;
    const counter = Math.max(kept?.counter ?? 0, served.stateCounter);
    const sealed = sealState(opened.accountKey, opened.accountId, counter, value);
    await keepState({ counter, sealed });
    return { ...opened, state: value };
  };

  return {
    /**
     * Device and keys after an unlock, and the open account with the kept state merged in;
     * undefined when they could not be kept safely
     */
    keep: async (
      record: DeviceRecord,
      opened: Opened,
      served: Stored,
      now: number,
    ): Promise<Opened | undefined> => {
      if (!(await restrictToTrustedContexts(area)).ok) return undefined;
      const value = await withKept(opened, served);
      // Set before the keys go in: without it the next popup would refuse them
      await scheduleLock(alarms, value.state.policyLock * MINUTE, now);
      const unlocked = { accountKey: value.accountKey, token: value.token };
      const stored = await Promise.all([
        device.store(deviceToKeys(record)),
        keys.store(unlockedToKeys(unlocked)),
      ]);
      return stored.every((result) => result.ok) ? value : undefined;
    },
    /** The account state as just written (state-sync.ts), for the next popup */
    keepState,
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
      const opened = { ...opening.value, accountId: record.accountId, token: unlocked.token };
      return withKept(opened, stored);
    },
    /** Locks: the keys and the alert list made from the open account (K-405) */
    clearKeys: () => clearUnlocked(area),
    /** Another account: the device and the state it kept go */
    clearDevice: async () => {
      await state.clear();
      return device.clear();
    },
  };
};
