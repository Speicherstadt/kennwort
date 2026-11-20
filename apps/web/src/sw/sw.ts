/**
 * The service worker of the web app (P-16), built into dist/sw.js under a fixed name by
 * apps/web/scripts/build-worker.ts, with the release key's public key written in. It stays
 * byte-identical across releases, so the browser never swaps it; every new version of the app comes
 * through worker.ts and its checks instead.
 */
import { fromHex } from "./release.ts";
import { asInertDocument, isServerNavigation } from "./server-paths.ts";
import {
  activate,
  CHECK_MESSAGE,
  type CheckOutcome,
  check,
  handles,
  install,
  respond,
  type WorkerDeps,
} from "./worker.ts";

/** Replaced by the build with the public key as hex */
declare const KENNWORT_RELEASE_PUBLIC_KEY: string;

// The DOM library's types know no worker events; these are the parts used here
type ExtendableEvent = Event & { waitUntil: (promise: Promise<unknown>) => void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
};
type WorkerMessage = ExtendableEvent & { data: unknown; ports: readonly MessagePort[] };
type WorkerScope = {
  location: Location;
  caches: CacheStorage;
  fetch: typeof fetch;
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void> };
  addEventListener: (type: string, listener: (event: never) => void) => void;
};

const scope = globalThis as unknown as WorkerScope;
const publicKey = fromHex(KENNWORT_RELEASE_PUBLIC_KEY);
if (publicKey?.length !== 32) throw new Error("the release key is missing from the build");

const deps: WorkerDeps = {
  fetch: (url, init) => scope.fetch(url, init),
  caches: scope.caches,
  origin: scope.location.origin,
  publicKey,
};

const installed = async () => {
  const result = await install(deps);
  // A failed install leaves no worker behind: nothing unverified is ever served from here
  if (!result.ok) throw new Error(`release refused: ${result.error} ${result.path ?? ""}`);
  await scope.skipWaiting();
};

/**
 * One check after the other, never two at once over the same state; each request gets a check of
 * its own that starts after the one before, so its answer reflects what the server offers now
 */
let queue: Promise<unknown> = Promise.resolve();
const checked = (): Promise<CheckOutcome> => {
  const next = queue.then(() => check(deps));
  queue = next.catch(() => undefined);
  return next;
};

scope.addEventListener("install", (event: ExtendableEvent) => event.waitUntil(installed()));

scope.addEventListener("activate", (event: ExtendableEvent) =>
  event.waitUntil(activate(deps).then(() => scope.clients.claim())),
);

scope.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const asked = { url: request.url, method: request.method, mode: request.mode };
  if (isServerNavigation(deps.origin, request.url, request.mode, request.method)) {
    event.respondWith(scope.fetch(request).then(asInertDocument));
    return;
  }
  if (!handles(deps.origin, asked)) return;
  event.respondWith(respond(deps, asked).then((answer) => answer ?? scope.fetch(request)));
});

scope.addEventListener("message", (event: WorkerMessage) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type !== CHECK_MESSAGE) return;
  event.waitUntil(checked().then((outcome) => event.ports[0]?.postMessage(outcome)));
});
