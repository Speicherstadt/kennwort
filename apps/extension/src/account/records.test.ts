import { describe, expect, it } from "vitest";
import { deviceFromKeys, deviceToKeys, unlockedFromKeys, unlockedToKeys } from "./records.ts";

const device = {
  server: "https://kennwort.weber-haustechnik.test",
  accountId: new Uint8Array(16).fill(1),
  secretKey: new Uint8Array(16).fill(2),
  deviceId: new Uint8Array(16).fill(3),
};

describe("records in the session area", () => {
  it("keep the device through named bytes", () => {
    expect(deviceFromKeys(deviceToKeys(device))).toEqual(device);
  });

  it("keep the unlocked keys through named bytes", () => {
    const unlocked = { accountKey: new Uint8Array(32).fill(9), token: "token-ä1" };
    expect(unlockedFromKeys(unlockedToKeys(unlocked))).toEqual(unlocked);
  });

  it("refuse a record with a missing or wrongly sized part", () => {
    const keys = deviceToKeys(device);
    for (const name of ["server", "account", "secret", "device"]) {
      const { [name]: _, ...rest } = keys;
      expect(deviceFromKeys(rest)).toBeUndefined();
    }
    expect(deviceFromKeys({ ...keys, account: new Uint8Array(15) })).toBeUndefined();
    expect(deviceFromKeys({ ...keys, server: Uint8Array.of(0xff) })).toBeUndefined();
    expect(
      unlockedFromKeys({ "account-key": new Uint8Array(31), token: Uint8Array.of(65) }),
    ).toBeUndefined();
    expect(unlockedFromKeys({ "account-key": new Uint8Array(32) })).toBeUndefined();
  });
});
