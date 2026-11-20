/**
 * Which verified versions the service worker holds (P-16): the one it serves, the one ready to take
 * over at the next navigation, and the one before, kept so a tab still open on it finds its files;
 * and the highest sequence it ever verified, so no older release comes back, not even with a new
 * worker. Pure decisions; state-store.ts keeps the state in memory and in Cache Storage.
 */
import type { Release } from "./release.ts";

export type Held = { version: string; sequence: number };
export type WorkerState = {
  current: Held | null;
  ready: Held | null;
  previous: Held | null;
  highest: number;
};

export const EMPTY_STATE: WorkerState = { current: null, ready: null, previous: null, highest: -1 };

const CACHE_PREFIX = "kennwort-release-";
export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`;
export const isReleaseCache = (name: string) => name.startsWith(CACHE_PREFIX);

export const held = (release: Release): Held => ({
  version: release.version,
  sequence: release.sequence,
});

/**
 * Only a release later than everything ever verified counts as an update: a server that plays back
 * an older signed release, or the current one again, gets nothing fetched
 */
export const isNewer = (state: WorkerState, release: Release): boolean =>
  release.sequence > state.highest;

/** A new worker may install the release it serves, or a later one, never an older one */
export const isOlder = (state: WorkerState, release: Release): boolean =>
  release.sequence < state.highest;

/** A freshly installed worker serves the release it has just verified */
export const installed = (state: WorkerState, release: Release): WorkerState => ({
  current: held(release),
  ready: null,
  previous: state.current?.version === release.version ? state.previous : state.current,
  highest: Math.max(state.highest, release.sequence),
});

export const readied = (state: WorkerState, release: Release): WorkerState => ({
  ...state,
  ready: held(release),
  highest: Math.max(state.highest, release.sequence),
});

/** At a navigation the ready version takes over; the one before stays for open tabs */
export const promoted = (state: WorkerState): WorkerState =>
  state.ready
    ? { current: state.ready, ready: null, previous: state.current, highest: state.highest }
    : state;

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
  const fields = value as Record<string, unknown>;
  const [current, ready, previous] = [fields.current, fields.ready, fields.previous].map((one) =>
    isHeld(one) ? one : null,
  ) as [Held | null, Held | null, Held | null];
  const stored = Number.isSafeInteger(fields.highest) ? (fields.highest as number) : -1;
  const sequences = [current, ready, previous].map((one) => one?.sequence ?? -1);
  return { current, ready, previous, highest: Math.max(stored, ...sequences) };
};
