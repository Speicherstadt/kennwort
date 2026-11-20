/**
 * Which verified versions the service worker holds (P-16): the one it serves, the one ready to take
 * over at the next navigation, and the one before, kept so a tab still open on it finds its files.
 * Pure decisions; the worker keeps the state in Cache Storage (cache-store.ts).
 */
import type { Release } from "./release.ts";

export type Held = { version: string; sequence: number };
export type WorkerState = { current: Held | null; ready: Held | null; previous: Held | null };

export const EMPTY_STATE: WorkerState = { current: null, ready: null, previous: null };

const CACHE_PREFIX = "kennwort-release-";
export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`;
export const isReleaseCache = (name: string) => name.startsWith(CACHE_PREFIX);

export const held = (release: Release): Held => ({
  version: release.version,
  sequence: release.sequence,
});

/**
 * Only a release later than everything held counts as an update: a server that plays back an
 * older signed release, or the current one again, gets nothing fetched
 */
export const isNewer = (state: WorkerState, release: Release): boolean =>
  release.sequence > Math.max(state.current?.sequence ?? -1, state.ready?.sequence ?? -1);

/** A freshly installed worker serves the release it has just verified */
export const installed = (state: WorkerState, release: Release): WorkerState => ({
  current: held(release),
  ready: null,
  previous: state.current?.version === release.version ? state.previous : state.current,
});

export const readied = (state: WorkerState, release: Release): WorkerState => ({
  ...state,
  ready: held(release),
});

/** At a navigation the ready version takes over; the one before stays for open tabs */
export const promoted = (state: WorkerState): WorkerState =>
  state.ready ? { current: state.ready, ready: null, previous: state.current } : state;

/** The caches worth keeping: those of the versions held */
export const keptCaches = (state: WorkerState): string[] =>
  [state.current, state.ready, state.previous]
    .filter((version): version is Held => version !== null)
    .map((version) => cacheName(version.version));

const isHeld = (value: unknown): value is Held =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Held).version === "string" &&
  Number.isSafeInteger((value as Held).sequence);

/** The state as stored; anything unreadable counts as nothing held */
export const readState = (value: unknown): WorkerState => {
  if (typeof value !== "object" || value === null) return EMPTY_STATE;
  const { current, ready, previous } = value as Record<string, unknown>;
  return {
    current: isHeld(current) ? current : null,
    ready: isHeld(ready) ? ready : null,
    previous: isHeld(previous) ? previous : null,
  };
};
