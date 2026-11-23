/**
 * The offline copy belongs to one account (K-308 part b): every operation on it runs after the one
 * before, and only for the account it holds. Opening another account empties it first, the logout
 * empties it for good. It also knows when the device last had the vault list from the server.
 */
import { createSignal } from "solid-js";
import type { KeyValue } from "./key-value.ts";

export const createCopyScope = (store: KeyValue, now: () => number) => {
  const [syncedAt, setSyncedAt] = createSignal<number | undefined>();
  // One operation after the other: switching accounts must not interleave with a write
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };
  let account: string | undefined;
  let loaded = false;
  // Another company of the account on screen (K-605): its answers are no part of this copy
  let suspended = false;
  const load = async () => {
    if (loaded) return;
    loaded = true;
    account = await store.get("account");
    const synced = Number(await store.get("synced"));
    setSyncedAt(account && Number.isFinite(synced) && synced > 0 ? synced : undefined);
  };
  return {
    syncedAt,
    /** A task for the copy of this account; nothing for another one or none */
    forAccount: <T>(id: string, task: () => Promise<T>, otherwise: T) =>
      serial(async () => {
        await load();
        return account === id ? task() : otherwise;
      }),
    /** A task for the copy of whatever account it holds; nothing while it holds none */
    forCurrent: <T>(task: () => Promise<T>, otherwise: T) =>
      serial(async () => {
        await load();
        return account === undefined || suspended ? otherwise : task();
      }),
    /** Inside a task: the server's vault list just came, so this is the last sync */
    synced: async () => {
      const at = now();
      await store.set("synced", String(at));
      setSyncedAt(at);
    },
    /** The account this device opens now: another account's copy is emptied first */
    useAccount: (id: string) =>
      serial(async () => {
        await load();
        if (account === id) return;
        await store.clear();
        await store.set("account", id);
        account = id;
        setSyncedAt(undefined);
      }),
    /**
     * While another company of the account is on screen (K-605, P-27) the copy keeps and serves
     * nothing of the account it holds: that company's reads and records would mix into it
     */
    suspend: (on: boolean) => {
      suspended = on;
    },
    /** Resolves once every operation asked for so far is done */
    settled: () => serial(async () => {}),
    /** Logout: the whole copy is gone */
    forget: () =>
      serial(async () => {
        await store.clear();
        account = undefined;
        loaded = true;
        setSyncedAt(undefined);
      }),
  };
};

export type CopyScope = ReturnType<typeof createCopyScope>;
