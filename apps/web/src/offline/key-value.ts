/**
 * Where the offline copy lives (K-308 part b): text under a key. The web app keeps it in IndexedDB
 * (idb.ts), the tests in memory. Only ciphertext and what the server holds anyway goes in
 * (local-copy.ts); a store that fails keeps nothing, and the app then simply needs the server.
 */
export type KeyValue = {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  /** Everything gone, as at logout */
  clear: () => Promise<void>;
};

/** For tests: the same in a Map, which a test can read to see what was kept */
export const memoryKeyValue = () => {
  const data = new Map<string, string>();
  const store: KeyValue = {
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    clear: async () => data.clear(),
  };
  return { ...store, data };
};
