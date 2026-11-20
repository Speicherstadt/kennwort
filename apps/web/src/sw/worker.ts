/**
 * What the service worker does, with its surroundings passed in (P-16): install and update only a
 * release whose signature and hashes hold, serve only verified bytes, and switch to a new version
 * at a navigation, never under a running page. sw.ts wires these to the browser's events.
 */
import { cachedFile, dropOldCaches, loadState, saveState, storeRelease } from "./cache-store.ts";
import {
  type Fetch,
  type FetchError,
  type Fetched,
  fetchFiles,
  fetchRelease,
} from "./fetch-release.ts";
import type { Release } from "./release.ts";
import { installed, isNewer, promoted, readied } from "./state.ts";

export type WorkerDeps = {
  fetch: Fetch;
  caches: CacheStorage;
  origin: string;
  publicKey: Uint8Array;
};

/** ready: a verified version waits for the next navigation; refused: why an offer failed its checks */
export type CheckOutcome = { ready: boolean; refused?: FetchError };
/** What the page sends to ask for a check; the answer, a CheckOutcome, comes on the given port */
export const CHECK_MESSAGE = "kennwort-check";
export type Asked = { url: string; method: string; mode: RequestMode };

/** Fetches and checks a release completely, and only then stores it */
const verifyAndStore = async (deps: WorkerDeps, release: Release): Promise<Fetched<Release>> => {
  const files = await fetchFiles(deps.fetch, deps.origin, release);
  if (!files.ok) return files;
  await storeRelease(deps.caches, deps.origin, release, files.value);
  return { ok: true, value: release };
};

/** The first version: if anything fails, the install fails and the worker serves nothing */
export const install = async (deps: WorkerDeps): Promise<Fetched<Release>> => {
  const offered = await fetchRelease(deps.fetch, deps.origin, deps.publicKey);
  if (!offered.ok) return offered;
  const stored = await verifyAndStore(deps, offered.value);
  if (!stored.ok) return stored;
  const state = await loadState(deps.caches, deps.origin);
  await saveState(deps.caches, deps.origin, installed(state, offered.value));
  return stored;
};

export const activate = async (deps: WorkerDeps) =>
  dropOldCaches(deps.caches, await loadState(deps.caches, deps.origin));

/** Looks for a later release; a failed one leaves everything as it was */
export const check = async (deps: WorkerDeps): Promise<CheckOutcome> => {
  const state = await loadState(deps.caches, deps.origin);
  const offered = await fetchRelease(deps.fetch, deps.origin, deps.publicKey);
  if (!offered.ok) return { ready: state.ready !== null, refused: offered.error };
  if (!isNewer(state, offered.value)) return { ready: state.ready !== null };
  const stored = await verifyAndStore(deps, offered.value);
  if (!stored.ok) return { ready: state.ready !== null, refused: stored.error };
  await saveState(deps.caches, deps.origin, readied(state, offered.value));
  return { ready: true };
};

/** The server's own paths: never cached, always asked */
const isNetworkOnly = (path: string) =>
  ["/api", "/auth"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** A navigation gets the app's page, or another page of the build, from the ready version if one waits */
const navigate = async (deps: WorkerDeps, path: string): Promise<Response | null> => {
  const before = await loadState(deps.caches, deps.origin);
  const state = promoted(before);
  if (state !== before) {
    await saveState(deps.caches, deps.origin, state);
    await dropOldCaches(deps.caches, state);
  }
  if (!state.current) return null;
  const { version } = state.current;
  const page = path.endsWith(".html")
    ? await cachedFile(deps.caches, deps.origin, version, path)
    : null;
  return page ?? cachedFile(deps.caches, deps.origin, version, "/index.html");
};

/** Whether the worker answers a request at all: not for other origins, methods or the server's paths */
export const handles = (origin: string, asked: Asked): boolean => {
  const url = new URL(asked.url);
  return asked.method === "GET" && url.origin === origin && !isNetworkOnly(url.pathname);
};

/**
 * The verified answer to a request, or null for the network: what the worker does not handle, and
 * anything no verified version contains, which only a verified page can ask for
 */
export const respond = async (deps: WorkerDeps, asked: Asked): Promise<Response | null> => {
  if (!handles(deps.origin, asked)) return null;
  const url = new URL(asked.url);
  if (asked.mode === "navigate") return navigate(deps, url.pathname);
  const state = await loadState(deps.caches, deps.origin);
  // An open tab of the version before still finds its lazily loaded files
  for (const version of [state.current, state.previous]) {
    if (!version) continue;
    const file = await cachedFile(deps.caches, deps.origin, version.version, url.pathname);
    if (file) return file;
  }
  return null;
};
