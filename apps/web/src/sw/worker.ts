/**
 * What the service worker does, with its surroundings passed in (P-16): install and update only a
 * release whose signature and hashes hold, serve only verified bytes, and switch to a new version
 * at a navigation, never under a running page. While a version is held, nothing the worker
 * handles comes from the network unchecked: what no verified cache has gets an error instead.
 * sw.ts wires these to the browser's events.
 */
import { appHeaders } from "@kennwort/core/headers";
import { cachedFile, releaseCaches, storeRelease } from "./cache-store.ts";
import {
  type Fetch,
  type FetchError,
  type Fetched,
  fetchFiles,
  fetchRelease,
} from "./fetch-release.ts";
import type { Release } from "./release.ts";
import { isServerPath } from "./server-paths.ts";
import {
  cacheName,
  installed,
  isNewer,
  isOlder,
  promoted,
  readied,
  type WorkerState,
} from "./state.ts";
import { changeState, currentState, dropUnheld, whileFilling } from "./state-store.ts";

export type WorkerDeps = {
  fetch: Fetch;
  caches: CacheStorage;
  origin: string;
  publicKey: Uint8Array;
};

export type InstallError = FetchError | "older";
/** ready: a verified version waits for the next navigation; refused: why an offer failed its checks */
export type CheckOutcome = { ready: boolean; refused?: FetchError };
/** What the page sends to ask for a check; the answer, a CheckOutcome, comes on the given port */
export const CHECK_MESSAGE = "kennwort-check";
export type Asked = { url: string; method: string; mode: RequestMode };

/**
 * Fetches and checks every file, then stores them and applies the change to the state as it is by
 * then; the cache counts as kept from the first byte stored until the state names it
 */
const verifyAndStore = async (
  deps: WorkerDeps,
  release: Release,
  change: (state: WorkerState) => WorkerState,
): Promise<Fetched<WorkerState>> => {
  const files = await fetchFiles(deps.fetch, deps.origin, release);
  if (!files.ok) return files;
  const state = await whileFilling(deps.caches, cacheName(release.version), async () => {
    await storeRelease(deps.caches, deps.origin, release, files.value);
    return changeState(deps.caches, deps.origin, change);
  });
  return { ok: true, value: state };
};

/**
 * The version a new worker serves: if anything fails, the install fails and the worker serves
 * nothing. A release older than one ever verified here is refused, so a new sw.js cannot be used to
 * bring an old release back.
 */
export const install = async (
  deps: WorkerDeps,
): Promise<{ ok: true; value: Release } | { ok: false; error: InstallError; path?: string }> => {
  const offered = await fetchRelease(deps.fetch, deps.origin, deps.publicKey);
  if (!offered.ok) return offered;
  const release = offered.value;
  if (isOlder(await currentState(deps.caches, deps.origin), release)) {
    return { ok: false, error: "older" };
  }
  const stored = await verifyAndStore(deps, release, (state) =>
    isOlder(state, release) ? state : installed(state, release),
  );
  if (!stored.ok) return stored;
  return stored.value.current?.version === release.version
    ? { ok: true, value: release }
    : { ok: false, error: "older" };
};

/** Takes over: writes its state once more, in case the worker before wrote over it, and cleans up */
export const activate = async (deps: WorkerDeps) => {
  const state = await changeState(deps.caches, deps.origin, (now) => now);
  await dropUnheld(deps.caches, state);
};

/** Looks for a later release; a failed one leaves everything as it was */
export const check = async (deps: WorkerDeps): Promise<CheckOutcome> => {
  const offered = await fetchRelease(deps.fetch, deps.origin, deps.publicKey);
  const before = await currentState(deps.caches, deps.origin);
  if (!offered.ok) return { ready: before.ready !== null, refused: offered.error };
  const release = offered.value;
  if (!isNewer(before, release)) return { ready: before.ready !== null };
  const stored = await verifyAndStore(deps, release, (state) =>
    isNewer(state, release) ? readied(state, release) : state,
  );
  // The state right after the change: a navigation since may have activated the version already,
  // and the page that asked still runs an older one
  if (stored.ok) return { ready: stored.value.ready !== null };
  const now = await currentState(deps.caches, deps.origin);
  return { ready: now.ready !== null, refused: stored.error };
};

/** Whether the worker answers a request: not for other origins, methods or the server's paths */
export const handles = (origin: string, asked: Asked): boolean => {
  const url = new URL(asked.url);
  return asked.method === "GET" && url.origin === origin && !isServerPath(url.pathname);
};

/** What the worker answers for a file no verified version has: never the network's version */
const unverified = (status: number) =>
  new Response("Not part of a verified release of Kennwort.", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/** A navigation gets the app's page, or another page of the build, from the ready version if one waits */
const navigate = async (deps: WorkerDeps, path: string): Promise<Response | null> => {
  const before = await currentState(deps.caches, deps.origin);
  const state = before.ready ? await changeState(deps.caches, deps.origin, promoted) : before;
  if (state !== before) await dropUnheld(deps.caches, state);
  if (!state.current) return null;
  const name = cacheName(state.current.version);
  const page = path.endsWith(".html")
    ? await cachedFile(deps.caches, deps.origin, name, path)
    : null;
  return (
    page ?? (await cachedFile(deps.caches, deps.origin, name, "/index.html")) ?? unverified(503)
  );
};

/** Any other file: from the current version, the one before, then any verified cache still here */
const file = async (deps: WorkerDeps, path: string): Promise<Response | null> => {
  const state = await currentState(deps.caches, deps.origin);
  if (!state.current) return null;
  const preferred = [state.current, state.previous]
    .filter((version) => version !== null)
    .map((version) => cacheName(version.version));
  const names = [...new Set([...preferred, ...(await releaseCaches(deps.caches))])];
  for (const name of names) {
    const found = await cachedFile(deps.caches, deps.origin, name, path);
    if (found) return found;
  }
  return unverified(404);
};

/**
 * The app's CSP and security headers on an answer of the worker: the caches hold verified bytes,
 * not the network's headers, so without these a page served from here would run with no policy.
 * No HSTS, which browsers take only from the network.
 */
const withAppHeaders = (origin: string, response: Response) => {
  const headers = new Headers(response.headers);
  const secure = new URL(origin).protocol === "https:";
  for (const [name, value] of Object.entries(appHeaders({ secure, hsts: false }))) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/**
 * The verified answer to a request, or null for the network: what the worker does not handle, and
 * everything before a version is held (the first install, P-16 residual risk)
 */
export const respond = async (deps: WorkerDeps, asked: Asked): Promise<Response | null> => {
  if (!handles(deps.origin, asked)) return null;
  const { pathname } = new URL(asked.url);
  const answer =
    asked.mode === "navigate" ? await navigate(deps, pathname) : await file(deps, pathname);
  return answer && withAppHeaders(deps.origin, answer);
};
