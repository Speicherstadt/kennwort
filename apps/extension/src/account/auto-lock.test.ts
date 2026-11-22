import { describe, expect, it } from "vitest";
import { ALERT_ITEM, createSessionKeys, DEVICE_ITEM } from "../session-keys.ts";
import { cancelLock, LOCK_ALARM, lockOnAlarm, lockStillAhead, scheduleLock } from "./auto-lock.ts";
import { fakeAlarms, memoryArea } from "./popup.test-kit.ts";

describe("the automatic lock", () => {
  it("rings after the lock time and is pushed back by every use", async () => {
    const { api, alarms } = fakeAlarms();
    await scheduleLock(api, 600_000, 1_000);
    expect(alarms.get(LOCK_ALARM)).toBe(601_000);
    await scheduleLock(api, 600_000, 5_000);
    expect(alarms.get(LOCK_ALARM)).toBe(605_000);
  });

  it("lets the keys be used only while the alarm is set and has not rung", async () => {
    const { api } = fakeAlarms();
    expect(await lockStillAhead(api, 0)).toBe(false);
    await scheduleLock(api, 1000, 0);
    expect(await lockStillAhead(api, 999)).toBe(true);
    expect(await lockStillAhead(api, 1000)).toBe(false);
    await cancelLock(api);
    expect(await lockStillAhead(api, 0)).toBe(false);
    expect(await lockStillAhead(undefined, 0)).toBe(false);
  });

  it("clears the unlocked keys and the alert list when the alarm rings, and keeps the device", async () => {
    const area = memoryArea();
    await createSessionKeys(area).store({ "account-key": new Uint8Array(32) });
    // K-405: the tags of the saved passwords go with the keys
    await area.set({ [ALERT_ITEM]: { salt: "00".repeat(16), records: [] } });
    await createSessionKeys(area, DEVICE_ITEM).store({ secret: new Uint8Array(16) });
    await lockOnAlarm(area, { name: "something-else" });
    expect(await createSessionKeys(area).read()).not.toEqual({ ok: true, value: undefined });
    await lockOnAlarm(area, { name: LOCK_ALARM });
    expect(await createSessionKeys(area).read()).toEqual({ ok: true, value: undefined });
    expect([...area.items.keys()]).toEqual([DEVICE_ITEM]);
  });
});
