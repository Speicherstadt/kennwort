/**
 * The verified versions in Cache Storage: one cache per version, holding only bytes whose hash the
 * manifest confirmed, and the worker's state, so it survives the browser stopping the worker.
 */
import type { Release } from "./release.ts";
import { cacheName, isReleaseCache, keptCaches, readState, type WorkerState } from "./state.ts";

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

export const saveState = async (caches: CacheStorage, origin: string, state: WorkerState) => {
  const response = new Response(JSON.stringify(state), {
    headers: { "content-type": "application/json" },
  });
  await (await caches.open(STATE_CACHE)).put(urlOf(origin, STATE_PATH), response);
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

/** Drops the caches of versions no longer held, the state's own cache aside */
export const dropOldCaches = async (caches: CacheStorage, state: WorkerState) => {
  const kept = keptCaches(state);
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => isReleaseCache(name) && !kept.includes(name))
      .map((name) => caches.delete(name)),
  );
};

/** A file of the version, or null when the version does not have it */
export const cachedFile = async (
  caches: CacheStorage,
  origin: string,
  version: string,
  path: string,
): Promise<Response | null> => {
  if (!(await caches.has(cacheName(version)))) return null;
  const cache = await caches.open(cacheName(version));
  return (await cache.match(urlOf(origin, path))) ?? null;
};
