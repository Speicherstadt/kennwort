import { describe, expect, it } from "vitest";
import { forgetDevice, readDevice, rememberDevice } from "./device.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};
const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("device", () => {
  it("remembers account ID and Secret Key, and forgets them", () => {
    const storage = memory();
    const accountId = new Uint8Array(16).fill(1);
    const secretKey = new Uint8Array(16).fill(2);
    rememberDevice(storage, accountId, secretKey);
    expect(readDevice(storage)).toEqual({ accountId: "AQEBAQEBAQEBAQEBAQEBAQ", secretKey });
    expect(storage.data.get("kennwort-device")).toContain('"secretKey":"K1-');
    forgetDevice(storage);
    expect(readDevice(storage)).toBeUndefined();
  });

  it("treats nonsense, a broken Secret Key, no storage or a storage that throws as a new device", () => {
    const storage = memory();
    for (const value of [
      "{",
      "null",
      '{"accountId":1}',
      '{"accountId":"a","secretKey":"K1-falsch"}',
    ])
      expect(readDevice({ ...storage, getItem: () => value })).toBeUndefined();
    expect(readDevice(undefined)).toBeUndefined();
    expect(readDevice(broken)).toBeUndefined();
    rememberDevice(broken, new Uint8Array(16), new Uint8Array(16));
    forgetDevice(broken);
    rememberDevice(undefined, new Uint8Array(16), new Uint8Array(16));
  });
});
