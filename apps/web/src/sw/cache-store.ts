/**
 * The verified versions in Cache Storage: one cache per version, holding only bytes whose hash the
 * manifest confirmed, and the worker's state, so it survives the browser stopping the worker.
 */
import type { Release } from "./release.ts";
import { cacheName, isReleaseCache, readState, type WorkerState } from "./state.ts";

export type VerifiedFile = { bytes: Uint8Array; type: string };
const STATE_CACHE = "kennwort-state";
const STATE_PATH = "/__kennwort/state";

/** Cache keys are full URLs of the worker's origin */
const urlOf = (origin: string, path: string) => new URL(path, origin).href;

export const loadState = async (caches: CacheStorage, origin: string): Promise<WorkerState> => {
  const stored = await (await caches.open(STATE_CACHE)).match(urlOf(origin, STATE_PATH));
  if (!stored) return readState(null);
  try {
    return readState(await stored.json());
  } catch {
    return readState(null);
  }
};

/**
 * Writes the state as it is when the cache is open, not as it was when asked: a slower write
 * never puts back a state that a later change has replaced
 */
export const saveState = async (
  caches: CacheStorage,
  origin: string,
  latest: () => WorkerState,
) => {
  const cache = await caches.open(STATE_CACHE);
  const response = new Response(JSON.stringify(latest()), {
    headers: { "content-type": "application/json" },
  });
  await cache.put(urlOf(origin, STATE_PATH), response);
};

/** Stores the verified bytes, never the responses they came in, so nothing else slips in */
export const storeRelease = async (
  caches: CacheStorage,
  origin: string,
  release: Release,
  files: Map<string, VerifiedFile>,
) => {
  const cache = await caches.open(cacheName(release.version));
  for (const [path, file] of files) {
    const response = new Response(file.bytes.slice().buffer, {
      headers: { "content-type": file.type },
    });
    await cache.put(urlOf(origin, path), response);
  }
};

/** Drops the release caches not named in kept; the state's own cache stays */
export const dropOldCaches = async (caches: CacheStorage, kept: string[]) => {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => isReleaseCache(name) && !kept.includes(name))
      .map((name) => caches.delete(name)),
  );
};

/** Every release cache present, each holding only verified bytes */
export const releaseCaches = async (caches: CacheStorage) =>
  (await caches.keys()).filter(isReleaseCache);

/** A file from the named release cache, or null when it does not have it */
export const cachedFile = async (
  caches: CacheStorage,
  origin: string,
  name: string,
  path: string,
): Promise<Response | null> => {
  if (!(await caches.has(name))) return null;
  const cache = await caches.open(name);
  return (await cache.match(urlOf(origin, path))) ?? null;
};
