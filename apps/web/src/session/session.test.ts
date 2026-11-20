import { encodeBytes } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import type { AccountApi as Api } from "./api.ts";
import { readDevice } from "./device.ts";
import { derive, fakeApi, memory, PASSPHRASE } from "./session.test-kit.ts";
import { createSession } from "./session.ts";

const timers = () => {
  const pending: (() => void)[] = [];
  return {
    schedule: (run: () => void) => {
      pending.push(run);
      return pending.length - 1;
    },
    cancel: (timer: unknown) => {
      if (typeof timer === "number") pending[timer] = () => {};
    },
    fire: () => {
      for (const run of pending.splice(0)) run();
    },
  };
};

describe("session", () => {
  it("sets up a company, remembers the device and shows the keys once", async () => {
    const storage = memory();
    const session = createSession({ api: fakeApi(), storage, derive });
    const result = await session.setUp("richtiger-code", PASSPHRASE);
    expect(result.ok).toBe(true);
    expect(session.opened()?.state.rootSecretKey).toHaveLength(32);
    expect(readDevice(storage)?.accountId).toBe(session.accountIdText());
    if (result.ok) expect(readDevice(storage)?.secretKey).toEqual(result.value.secretKey);
    if (result.ok) expect(readDevice(storage)?.accountId).toBe(encodeBytes(result.value.accountId));
  });

  it("locks, overwrites the account key and unlocks again with the passphrase", async () => {
    const api = fakeApi();
    const storage = memory();
    const session = createSession({ api, storage, derive });
    await session.setUp("richtiger-code", PASSPHRASE);
    const key = session.opened()?.accountKey as Uint8Array;
    const copy = Uint8Array.from(key);
    session.lock();
    flush();
    expect(session.opened()).toBeUndefined();
    expect(key.every((byte) => byte === 0)).toBe(true);
    expect(await session.unlock("falsch falsch falsch falsch")).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(await session.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
    expect(session.opened()?.accountKey).toEqual(copy);
  });

  it("locks by itself after a while without use; any use pushes it back", async () => {
    const clock = timers();
    const session = createSession({
      api: fakeApi(),
      storage: memory(),
      derive,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    await session.setUp("richtiger-code", PASSPHRASE);
    session.touch();
    session.touch();
    expect(session.opened()).toBeDefined();
    clock.fire();
    flush();
    expect(session.opened()).toBeUndefined();
    session.touch();
  });

  it("unlocks on a new device with account ID and Secret Key, and remembers them", async () => {
    const api = fakeApi();
    const first = createSession({ api, storage: memory(), derive });
    const made = await first.setUp("richtiger-code", PASSPHRASE);
    const storage = memory();
    const second = createSession({ api, storage, derive });
    expect(second.device()).toBeUndefined();
    expect(await second.unlock(PASSPHRASE)).toEqual({ ok: false, error: "wrong-passphrase" });
    if (!made.ok) throw new Error("setup");
    expect(await second.unlock(PASSPHRASE, made.value.secretKey, first.accountIdText())).toEqual({
      ok: true,
      value: true,
    });
    expect(second.device()?.accountId).toBe(first.accountIdText());
  });

  it("accepts an invitation with the root fingerprint from the link", async () => {
    const session = createSession({ api: fakeApi(), storage: memory(), derive });
    const root = new Uint8Array(32).fill(7);
    expect((await session.accept("inv-1", "einladung", root, PASSPHRASE)).ok).toBe(true);
    expect(session.opened()?.state.rootFingerprint).toEqual(root);
    expect(session.opened()?.keyBlock.rootFingerprint).toEqual(root);
    expect(
      await createSession({ api: fakeApi(), storage: memory(), derive }).accept(
        "inv-1",
        "alt",
        root,
        PASSPHRASE,
      ),
    ).toEqual({
      ok: false,
      error: "invalid-invitation",
    });
  });

  it("names what went wrong", async () => {
    const make = (overrides: Partial<Api>) =>
      createSession({ api: fakeApi(overrides), storage: memory(), derive });
    expect(await make({}).setUp("falscher-code", PASSPHRASE)).toEqual({
      ok: false,
      error: "wrong-code",
    });
    expect(
      await make({ uploadKeys: async () => false }).setUp("richtiger-code", PASSPHRASE),
    ).toEqual({ ok: false, error: "unexpected" });
    const session = make({});
    await session.setUp("richtiger-code", PASSPHRASE);
    session.lock();
    const limited = {
      ...fakeApi(),
      signIn: async () => ({ ok: false as const, error: "locked" as const }),
    };
    const locked = createSession({ api: limited, storage: memory(), derive });
    expect(await locked.unlock(PASSPHRASE, new Uint8Array(16), session.accountIdText())).toEqual({
      ok: false,
      error: "too-many-requests",
    });
    const broken = createSession({
      api: {
        ...fakeApi(),
        signIn: async () => ({ ok: true as const, token: "x" }),
        keys: async () => undefined,
      },
      storage: memory(),
      derive,
    });
    expect(await broken.unlock(PASSPHRASE, new Uint8Array(16), session.accountIdText())).toEqual({
      ok: false,
      error: "unexpected",
    });
    expect(await broken.unlock(PASSPHRASE, new Uint8Array(16), "kein-gueltiges-konto")).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
  });
});
