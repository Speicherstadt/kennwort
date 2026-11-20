import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { DEVICE_ITEM, KEYS_ITEM, type SessionArea } from "../session-keys.ts";
import { LOCK_ALARM } from "./auto-lock.ts";
import { accountServer, derive, fakeAlarms, memoryArea, PASSPHRASE } from "./popup.test-kit.ts";
import { createPopupAccount, type PopupAccountDeps } from "./popup-account.ts";
import type { DeviceRecord } from "./records.ts";

// K-402: unlocking in the popup with the web app's flow; keys only in chrome.storage.session
const SERVER = "https://kennwort.weber-haustechnik.test";

const setup = (overrides: Partial<PopupAccountDeps> = {}) => {
  const server = accountServer();
  const area = memoryArea();
  const alarms = fakeAlarms();
  let clock = 1_000_000;
  const apiFor = vi.fn((_device: DeviceRecord) => server.api);
  const deps: PopupAccountDeps = {
    area,
    alarms: alarms.api,
    apiFor,
    derive,
    now: () => clock,
    schedule: () => 0,
    cancel: () => {},
    ...overrides,
  };
  const input = {
    server: SERVER,
    accountId: server.accountId,
    secretKey: server.secretKey,
    passphrase: PASSPHRASE,
  };
  return {
    server,
    area,
    alarms,
    deps,
    input,
    apiFor,
    account: createPopupAccount(deps),
    /** The popup closes and opens again: a new account object over the same session area */
    reopen: () => createPopupAccount(deps),
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

const stored = (area: { items: Map<string, unknown> }) => JSON.stringify([...area.items]);

describe("connecting and unlocking", () => {
  it("connects with server, account ID, Secret Key and passphrase and opens the account", async () => {
    const { account, input, apiFor } = setup();
    await account.restore();
    flush();
    expect(account.phase()).toBe("connect");
    expect(await account.connect(input)).toEqual({ ok: true });
    flush();
    expect(account.phase()).toBe("open");
    expect(account.opened()?.keyBlock.ed.secretKey).toHaveLength(32);
    expect(apiFor.mock.calls[0]?.[0]).toMatchObject({ server: SERVER });
  });

  it("puts AK, token and device into the session area only, never the passphrase", async () => {
    const { account, input, area } = setup();
    await account.connect(input);
    expect([...area.items.keys()].sort()).toEqual([DEVICE_ITEM, KEYS_ITEM]);
    expect(stored(area)).not.toContain(PASSPHRASE);
    const keys = area.items.get(KEYS_ITEM) as Record<string, number[]>;
    expect(Object.keys(keys).sort()).toEqual(["account-key", "token"]);
    expect(keys["account-key"]).toHaveLength(32);
  });

  it("closes the session area to content scripts before it stores a key", async () => {
    const base = memoryArea();
    const order: string[] = [];
    const area: SessionArea = {
      ...base,
      set: async (values) => {
        order.push("set");
        await base.set(values);
      },
      setAccessLevel: async () => void order.push("restrict"),
    };
    const { account, input } = setup({ area });
    await account.connect(input);
    expect(order[0]).toBe("restrict");
  });

  it("stores nothing and stays locked when the area cannot be closed to content scripts", async () => {
    const base = memoryArea();
    const area: SessionArea = { ...base, setAccessLevel: async () => Promise.reject(new Error()) };
    const { account, input } = setup({ area });
    expect(await account.connect(input)).toEqual({ ok: false, error: "storage-failed" });
    flush();
    expect(account.phase()).not.toBe("open");
    expect(base.items.size).toBe(0);
  });

  it("refuses a wrong passphrase, server or account and stores nothing", async () => {
    const { account, input, area } = setup();
    expect(await account.connect({ ...input, passphrase: "falsch" })).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(await account.connect({ ...input, server: "http://kennwort.test" })).toEqual({
      ok: false,
      error: "insecure-server",
    });
    expect(await account.connect({ ...input, accountId: "kurz" })).toEqual({
      ok: false,
      error: "invalid-account",
    });
    expect(await account.connect({ ...input, secretKey: "A3-XXXX" })).toEqual({
      ok: false,
      error: "invalid-account",
    });
    expect(area.items.size).toBe(0);
  });

  it("says the server cannot be reached, with no offline copy to fall back on", async () => {
    const server = accountServer();
    const unreachable = {
      ...server.api,
      signIn: async () => ({ ok: false as const, error: "unreachable" as const }),
    };
    const { account, input, area } = setup({ apiFor: () => unreachable });
    expect(await account.connect(input)).toEqual({ ok: false, error: "unreachable" });
    expect(area.items.size).toBe(0);
  });

  it("sets the lock alarm to the lock time the account state remembers", async () => {
    const { account, input, alarms } = setup();
    await account.connect(input);
    expect(alarms.alarms.get(LOCK_ALARM)).toBe(1_000_000 + 10 * 60_000);
    flush();
    expect(account.lockMinutes()).toBe(10);
  });
});

describe("locking", () => {
  it("clears AK and the token from the area and the memory, and keeps the device", async () => {
    const { account, input, area, alarms } = setup();
    await account.connect(input);
    const accountKey = account.opened()?.accountKey as Uint8Array;
    await account.lock();
    flush();
    expect(account.phase()).toBe("locked");
    expect(account.opened()).toBeUndefined();
    expect([...area.items.keys()]).toEqual([DEVICE_ITEM]);
    expect(accountKey.every((byte) => byte === 0)).toBe(true);
    expect(alarms.alarms.has(LOCK_ALARM)).toBe(false);
  });

  it("unlocks again with the passphrase alone once the device is known", async () => {
    const { account, input } = setup();
    await account.connect(input);
    await account.lock();
    expect(await account.unlock("falsch")).toEqual({ ok: false, error: "wrong-passphrase" });
    expect(await account.unlock(PASSPHRASE)).toEqual({ ok: true });
  });

  it("locks by itself after the lock time while the popup is open", async () => {
    let run: (() => void) | undefined;
    let waited = 0;
    const { account, input, area } = setup({
      schedule: (next, ms) => {
        run = next;
        waited = ms;
        return 1;
      },
    });
    await account.connect(input);
    expect(waited).toBe(10 * 60_000);
    run?.();
    await vi.waitFor(() => expect(area.items.has(KEYS_ITEM)).toBe(false));
  });

  it("takes the company's lock time and counts it from then on", async () => {
    const { account, input, alarms, advance } = setup();
    await account.connect(input);
    advance(60_000);
    account.setLockAfter(2 * 60_000);
    flush();
    expect(account.lockMinutes()).toBe(2);
    expect(alarms.alarms.get(LOCK_ALARM)).toBe(1_000_000 + 60_000 + 2 * 60_000);
  });

  it("forgets the device for another account", async () => {
    const { account, input, area } = setup();
    await account.connect(input);
    await account.forget();
    flush();
    expect(account.phase()).toBe("connect");
    expect(area.items.size).toBe(0);
  });
});

describe("opening the popup again", () => {
  it("is still unlocked while the lock alarm has not rung", async () => {
    const { account, input, reopen, advance } = setup();
    await account.connect(input);
    advance(5 * 60_000);
    const again = reopen();
    await again.restore();
    flush();
    expect(again.phase()).toBe("open");
    expect(again.opened()?.keyBlock.ed.secretKey).toEqual(account.opened()?.keyBlock.ed.secretKey);
  });

  it("is locked once the lock time ran out, and the keys are gone", async () => {
    const { account, input, reopen, advance, area } = setup();
    await account.connect(input);
    advance(10 * 60_000);
    const again = reopen();
    await again.restore();
    flush();
    expect(again.phase()).toBe("locked");
    expect(area.items.has(KEYS_ITEM)).toBe(false);
  });

  it("is locked when the alarm is gone (the service worker cleared the keys or the alarm)", async () => {
    const { account, input, reopen, alarms } = setup();
    await account.connect(input);
    alarms.alarms.clear();
    const again = reopen();
    await again.restore();
    flush();
    expect(again.phase()).toBe("locked");
  });

  it("is locked when the server no longer knows the token", async () => {
    const { account, input, reopen, server, area } = setup();
    await account.connect(input);
    server.expire();
    const again = reopen();
    await again.restore();
    flush();
    expect(again.phase()).toBe("locked");
    expect(area.items.has(KEYS_ITEM)).toBe(false);
  });

  it("asks to connect when the session area holds no device or a damaged one", async () => {
    const { reopen, area } = setup();
    area.items.set(DEVICE_ITEM, { server: [1, 2] });
    const again = reopen();
    await again.restore();
    flush();
    expect(again.phase()).toBe("connect");
  });
});
