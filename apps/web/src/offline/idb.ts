/**
 * The offline copy's store in the browser: one IndexedDB database with one object store of text
 * values (K-308 part b), through the plain IndexedDB API instead of a library. A browser without
 * IndexedDB, or one that refuses it (private windows, full disks), keeps nothing: every call
 * resolves, reads give nothing, and the app needs the server as before.
 */
import type { KeyValue } from "./key-value.ts";

export const DATABASE = "kennwort-offline";
export const STORE = "copy";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDatabase = (factory: IDBFactory) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked")); // i18n-ignore: never shown
  });

export const indexedDbKeyValue = (factory: IDBFactory | undefined): KeyValue => {
  let database: Promise<IDBDatabase | undefined> | undefined;
  const opened = () => {
    database ??= factory
      ? (async () => openDatabase(factory))().catch(() => undefined)
      : Promise.resolve(undefined);
    return database;
  };
  /** One request in a transaction of its own; a failure counts as nothing kept */
  const run = async <T>(
    mode: IDBTransactionMode,
    make: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await opened();
    if (!db) return undefined;
    try {
      return await done(make(db.transaction(STORE, mode).objectStore(STORE)));
    } catch {
      return undefined;
    }
  };
  return {
    get: async (key) => {
      const value = await run("readonly", (store) => store.get(key));
      return typeof value === "string" ? value : undefined;
    },
    set: async (key, value) => void (await run("readwrite", (store) => store.put(value, key))),
    clear: async () => void (await run("readwrite", (store) => store.clear())),
  };
};
