/**
 * The worker's state in memory, with Cache Storage behind it. A change applies to the state in
 * memory at once and in full, so a navigation and a check that run side by side never undo each
 * other (review of K-308a); a check that waits on the server works on the state as it is when it
 * is done, not as it was when it began. Also the caches being filled right now, which no clean-up
 * may drop before the state names them.
 */
import { dropOldCaches, loadState, saveState } from "./cache-store.ts";
import { keptCaches, type WorkerState } from "./state.ts";

type Store = { state: WorkerState | null; loading: Promise<WorkerState> | null; filling: string[] };

// One store per Cache Storage: the browser runs one worker per origin, the tests one per double
const stores = new WeakMap<CacheStorage, Store>();

const storeOf = (caches: CacheStorage): Store => {
  const known = stores.get(caches);
  if (known) return known;
  const store: Store = { state: null, loading: null, filling: [] };
  stores.set(caches, store);
  return store;
};

export const currentState = async (caches: CacheStorage, origin: string): Promise<WorkerState> => {
  const store = storeOf(caches);
  if (store.state) return store.state;
  store.loading ??= loadState(caches, origin).then((loaded) => {
    store.state ??= loaded;
    return store.state;
  });
  return store.loading;
};

/** Applies the change to the state as it is now, then stores it */
export const changeState = async (
  caches: CacheStorage,
  origin: string,
  change: (state: WorkerState) => WorkerState,
): Promise<WorkerState> => {
  const store = storeOf(caches);
  const before = await currentState(caches, origin);
  const after = change(store.state ?? before);
  store.state = after;
  await saveState(caches, origin, () => store.state ?? after);
  return after;
};

/** Drops every release cache the state does not hold, but none that is being filled */
export const dropUnheld = async (caches: CacheStorage, state: WorkerState) =>
  dropOldCaches(caches, [...keptCaches(state), ...storeOf(caches).filling]);

/** Runs fill while its cache counts as kept */
export const whileFilling = async <T>(
  caches: CacheStorage,
  name: string,
  fill: () => Promise<T>,
): Promise<T> => {
  const store = storeOf(caches);
  store.filling.push(name);
  try {
    return await fill();
  } finally {
    store.filling.splice(store.filling.indexOf(name), 1);
  }
};
