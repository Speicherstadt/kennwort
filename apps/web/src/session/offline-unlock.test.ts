import { encodeBytes, openState, type Stored } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { memoryKeyValue } from "../offline/key-value.ts";
import { createLocalCopy } from "../offline/local-copy.ts";
import type { AccountApi as Api } from "./api.ts";
import { derive, fakeApi, memory, PASSPHRASE } from "./session.test-kit.ts";
import { createSession } from "./session.ts";
import { stateServer } from "./state-server.test-kit.ts";

// K-308 part b: the device keeps the wrapped AK and the account state as ciphertext, unlocks with
// passphrase and Secret Key when the server does not answer, and signs in once it does again

/** Every write the session started on the copy done: the memory store answers in microtasks */
const idle = async (copy: ReturnType<typeof createLocalCopy>) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await copy.settled();
};

const unreachable = { ok: false as const, error: "unreachable" as const };

/** An account set up and unlocked once online, so the copy holds what it needs */
const unlockedOnce = async () => {
  const store = memoryKeyValue();
  const copy = createLocalCopy(store);
  const server = fakeApi();
  let online = true;
  let served: Stored | undefined;
  const api: Api = {
    ...server,
    signIn: async (...args) => (online ? server.signIn(...args) : unreachable),
    signInWithLoginKey: async (...args) =>
      online ? server.signInWithLoginKey(...args) : unreachable,
    keys: async (token) => (online ? (served ?? server.keys(token)) : undefined),
  };
  const session = createSession({ api, storage: memory(), derive, copy });
  const made = await session.setUp("richtiger-code", PASSPHRASE);
  if (!made.ok) throw new Error(made.error);
  session.lock();
  expect(await session.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
  await idle(copy);
  const goOffline = () => {
    online = false;
  };
  const comeBack = () => {
    online = true;
  };
  /** From now on the server serves these ciphertexts of the account */
  const serve = (stored: Stored) => {
    served = stored;
  };
  return { store, copy, session, server, made: made.value, goOffline, comeBack, serve };
};

describe("unlocking from the offline copy", () => {
  it("keeps only ciphertext: no passphrase, Secret Key, AK or key in the copy", async () => {
    const { store, session, made } = await unlockedOnce();
    const kept = [...store.data.values()].join("\n");
    expect(store.data.has("keys")).toBe(true);
    expect(store.data.has("state")).toBe(true);
    expect(kept).not.toContain(PASSPHRASE);
    const opened = session.opened();
    if (!opened) throw new Error("not open");
    for (const secret of [
      made.secretKey,
      made.recoveryKey,
      opened.accountKey,
      opened.keyBlock.ed.secretKey,
      opened.keyBlock.xwing.secretKey,
    ])
      expect(kept).not.toContain(encodeBytes(secret));
  });

  it("opens with passphrase and Secret Key when the server does not answer", async () => {
    const { session, goOffline } = await unlockedOnce();
    const key = Uint8Array.from(session.opened()?.accountKey ?? []);
    session.lock();
    goOffline();
    expect(await session.unlock("falsch falsch falsch falsch")).toEqual({
      ok: false,
      error: "wrong-passphrase",
    });
    expect(await session.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
    flush();
    const opened = session.opened();
    expect(opened?.accountKey).toEqual(key);
    expect(opened?.token).toBe("");
    expect(opened?.loginKey).toHaveLength(32);
  });

  it("says the server is unreachable when this device has no copy of the account", async () => {
    const copy = createLocalCopy(memoryKeyValue());
    const api = fakeApi({ signIn: async () => unreachable });
    const session = createSession({ api, storage: memory(), derive, copy });
    expect(await session.unlock(PASSPHRASE, new Uint8Array(16), "A".repeat(22))).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("signs in with the kept sign-in key once the server answers, and drops that key", async () => {
    const { session, goOffline, comeBack } = await unlockedOnce();
    session.lock();
    goOffline();
    await session.unlock(PASSPHRASE);
    expect(await session.reconnect()).toBe(false);
    flush();
    const loginKey = session.opened()?.loginKey as Uint8Array;
    comeBack();
    expect(await session.reconnect()).toBe(true);
    flush();
    expect(session.opened()?.token).toMatch(/^signed-in-/);
    expect(session.opened()?.loginKey).toBeUndefined();
    expect(loginKey.every((byte) => byte === 0)).toBe(true);
    // Online already: nothing to do
    expect(await session.reconnect()).toBe(true);
  });

  it("overwrites the kept sign-in key on lock", async () => {
    const { session, goOffline } = await unlockedOnce();
    session.lock();
    goOffline();
    await session.unlock(PASSPHRASE);
    flush();
    const loginKey = session.opened()?.loginKey as Uint8Array;
    session.lock();
    expect(loginKey.every((byte) => byte === 0)).toBe(true);
    expect(await session.reconnect()).toBe(false);
  });

  it("keeps the copy at lock and deletes it at logout", async () => {
    const { store, copy, session } = await unlockedOnce();
    session.lock();
    expect(store.data.has("keys")).toBe(true);
    session.forget();
    await idle(copy);
    expect(store.data.size).toBe(0);
  });
});

describe("the highest account state this device saw", () => {
  it("is not rolled back by a server that serves an older account state (E-07)", async () => {
    const { copy, session, server, goOffline } = await unlockedOnce();
    const opened = session.opened();
    if (!opened) throw new Error("not open");
    const upload = await server.keys(opened.token);
    if (!upload) throw new Error("no keys");
    // The device remembers a log head and writes it back; the server then forgets it again
    const states = stateServer(upload);
    const head = { seq: 5, hash: new Uint8Array(32).fill(5) };
    const saved = await session.updateState(states.deps, (s) => ({ ...s, logs: { buero: head } }));
    expect(saved.ok).toBe(true);
    await idle(copy);
    const kept = await copy.state(encodeBytes(opened.accountId));
    expect(kept?.counter).toBe(1);
    const openedKept =
      kept && openState(opened.accountKey, opened.accountId, kept.counter, kept.sealed);
    expect(openedKept?.ok && openedKept.value.logs.buero).toEqual(head);
    session.lock();
    // Online, the server serves the state of counter 0 without the head: the merge keeps it
    expect(await session.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
    flush();
    expect(session.opened()?.state.logs.buero).toEqual(head);
    // Offline the kept state is what opens
    session.lock();
    goOffline();
    expect(await session.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
    flush();
    expect(session.opened()?.state.logs.buero).toEqual(head);
  });

  it("keeps this device's state when the server's conflicts with it (another hash, E-08)", async () => {
    const { copy, session, server, serve } = await unlockedOnce();
    const opened = session.opened();
    if (!opened) throw new Error("not open");
    const upload = await server.keys(opened.token);
    if (!upload) throw new Error("no keys");
    const states = stateServer(upload);
    const mine = { seq: 2, hash: new Uint8Array(32).fill(2) };
    await session.updateState(states.deps, (s) => ({ ...s, logs: { buero: mine } }));
    await idle(copy);
    // The server shows another hash at the same place, sealed under AK by another device
    states.otherDeviceWrites(opened.accountKey, {
      ...opened.state,
      logs: { buero: { seq: 2, hash: new Uint8Array(32).fill(9) } },
    });
    serve(states.current());
    session.lock();
    expect(await session.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
    flush();
    expect(session.opened()?.state.logs.buero).toEqual(mine);
  });
});
