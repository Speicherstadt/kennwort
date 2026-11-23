// K-707: what the web app remembers of the passkey that unlocks, and when it forgets it
import type { Opened } from "@kennwort/client/session/open-account.ts";
import type { PasskeyDevice } from "@kennwort/client/session/passkey-unlock.ts";
import { addPasskey, emptyState, encodeBytes, removePasskey } from "@kennwort/core";
import { newKeyBlock } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  createPasskeyUnlock,
  forgetPasskeyDevice,
  type PasskeySessionDeps,
  readPasskeyDevice,
} from "./passkey.ts";

const accountId = new Uint8Array(16).fill(1);
const rawId = new Uint8Array(20).fill(3);
const salt = new Uint8Array(32).fill(5);
const device: PasskeyDevice = {
  accountId: encodeBytes(accountId),
  credentialId: encodeBytes(rawId),
  salt: encodeBytes(salt),
};

const memory = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
};

const opened = (passkeys = addPasskey({}, rawId, salt, 1) ?? {}): Opened => ({
  accountId,
  accountKey: new Uint8Array(32).fill(7),
  keyBlock: newKeyBlock(new Uint8Array(32)),
  state: { ...emptyState(new Uint8Array(32)), passkeys },
  token: "t",
});

const stored = {
  accountId,
  accountSalt: new Uint8Array(16),
  keyBlock: new Uint8Array(),
  state: new Uint8Array(),
  stateCounter: 0,
  unlock: { passphrase: new Uint8Array(), recovery: new Uint8Array() },
};

type Flows = NonNullable<PasskeySessionDeps["flows"]>;
const setUp = (
  flows: Partial<Flows>,
  storage = memory(),
  known: string | undefined = device.accountId,
) => {
  const opens: Opened[] = [];
  const sent: { method: string; path: string; token: string | undefined }[] = [];
  const unlock = createPasskeyUnlock(
    {
      storage,
      passkeys: {
        call: async (method, path, _body, token) => {
          sent.push({ method, path, token });
          return path === "/api/devices"
            ? {
                status: 200,
                json: {
                  devices: [{ id: "s-1", name: null, signedInAt: 1, lastSeenAt: 1, current: true }],
                },
              }
            : { status: 0, json: undefined };
        },
        webAuthn: {} as never,
        api: { keys: async () => undefined, writeState: async () => ({ ok: true }) },
      },
      flows: {
        setUp: async () => ({ ok: true, value: device }),
        remove: async () => ({ ok: true, value: true }),
        unlock: async () => ({ ok: false, error: "cancelled" }),
        ...flows,
      },
    },
    {
      opened: () => undefined,
      open: (value) => void opens.push(value),
      updateState: async () => ({ ok: false, error: "unreachable" }),
      device: () => (known ? { accountId: known, secretKey: new Uint8Array(16) } : undefined),
    },
  );
  return { unlock, storage, opens, sent };
};

describe("the passkey this device unlocks with (K-707)", () => {
  it("remembers it after setting up and offers it for the known account only", async () => {
    const { unlock, storage } = setUp({});
    expect(unlock.offered()).toBeUndefined();
    expect((await unlock.setUp()).ok).toBe(true);
    expect(readPasskeyDevice(storage)).toEqual(device);
    expect(unlock.offered()).toEqual(device);
    expect(unlock.thisDevice()).toBe(device.credentialId);
    const other = setUp({}, storage, encodeBytes(new Uint8Array(16).fill(9)));
    expect(other.unlock.offered()).toBeUndefined();
  });

  it("reads nothing from a storage that holds nonsense or throws", () => {
    expect(readPasskeyDevice(memory({ "kennwort-passkey": "{" }))).toBeUndefined();
    expect(readPasskeyDevice(memory({ "kennwort-passkey": '{"accountId":1}' }))).toBeUndefined();
    expect(readPasskeyDevice(undefined)).toBeUndefined();
    const throwing = {
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
    expect(readPasskeyDevice(throwing)).toBeUndefined();
    expect(() => forgetPasskeyDevice(throwing)).not.toThrow();
  });

  it("offers nothing without WebAuthn", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const unlock = createPasskeyUnlock(
      { storage },
      {
        opened: () => undefined,
        open: () => {},
        updateState: async () => ({ ok: false, error: "unreachable" }),
        device: () => ({ accountId: device.accountId, secretKey: new Uint8Array(16) }),
      },
    );
    expect(unlock.offered()).toBeUndefined();
    expect(await unlock.setUp()).toEqual({ ok: false, error: "no-prf" });
  });

  it("opens the account it unlocked", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const value = opened();
    const { unlock, opens } = setUp(
      { unlock: async () => ({ ok: true, value: { opened: value, stored } }) },
      storage,
    );
    expect(await unlock.unlock()).toEqual({ ok: true, value: true });
    expect(opens).toEqual([value]);
  });

  it("forgets a passkey the server or the state no longer has", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const { unlock } = setUp(
      { unlock: async () => ({ ok: false, error: "passkey-removed" }) },
      storage,
    );
    expect(await unlock.unlock()).toEqual({ ok: false, error: "passkey-removed" });
    expect(readPasskeyDevice(storage)).toBeUndefined();
    expect(unlock.offered()).toBeUndefined();
  });

  it("keeps it after a cancelled ceremony", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const { unlock } = setUp({}, storage);
    expect(await unlock.unlock()).toEqual({ ok: false, error: "cancelled" });
    expect(readPasskeyDevice(storage)).toEqual(device);
  });

  it("refuses a passkey that a removal this device kept still names removed", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const gone = opened(removePasskey(addPasskey({}, rawId, salt, 1) ?? {}, rawId) ?? {});
    const { unlock, opens } = setUp(
      { unlock: async () => ({ ok: true, value: { opened: gone, stored } }) },
      storage,
    );
    expect(await unlock.unlock()).toEqual({ ok: false, error: "passkey-removed" });
    expect(opens).toEqual([]);
    expect(gone.accountKey).toEqual(new Uint8Array(32));
  });

  it("signs out the new session when a removal this device kept refuses the passkey", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const gone = opened(removePasskey(addPasskey({}, rawId, salt, 1) ?? {}, rawId) ?? {});
    const { unlock, sent } = setUp(
      { unlock: async () => ({ ok: true, value: { opened: gone, stored } }) },
      storage,
    );
    await unlock.unlock();
    expect(sent).toContainEqual({ method: "DELETE", path: "/api/devices/s-1", token: "t" });
  });

  it("forgets it when this device's passkey is removed", async () => {
    const storage = memory({ "kennwort-passkey": JSON.stringify(device) });
    const { unlock } = setUp({}, storage);
    await unlock.remove(encodeBytes(new Uint8Array(20).fill(8)));
    expect(readPasskeyDevice(storage)).toEqual(device);
    await unlock.remove(device.credentialId);
    expect(readPasskeyDevice(storage)).toBeUndefined();
  });
});
