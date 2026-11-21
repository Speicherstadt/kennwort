/**
 * The only place the extension keeps unlocked keys: `chrome.storage.session`, which lives in memory
 * and is gone when the browser closes (docs/sicherheitsdesign.md, Schlüsselhierarchie; CLAUDE.md,
 * Never). The popup and the service worker both reach it, so a key survives the popup closing and
 * the worker being stopped, but never touches the disk.
 */

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const err = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });

/** The part of `chrome.storage.session` this module needs; tests pass a fake */
export type SessionArea = {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
  // Chrome, Edge and Safari have it; Firefox does not, and keeps the area from content scripts anyway
  setAccessLevel?: (options: { accessLevel: "TRUSTED_CONTEXTS" }) => Promise<void>;
  /** The inline menu follows an unlock or a lock in the popup (K-403) */
  onChanged?: { addListener(listener: (changes: Record<string, unknown>) => void): void };
};

/** Named keys, for example the account key and the private keys of the key block */
export type Keys = Record<string, Uint8Array>;
export type KeyError = "unavailable" | "storage-failed" | "malformed";

/** The unlocked keys; cleared on lock */
export const KEYS_ITEM = "kennwort-keys";
/** What the extension knows of its account (server, account ID, Secret Key); kept over a lock */
export const DEVICE_ITEM = "kennwort-device";
/**
 * The account state as this device last saw or wrote it, sealed under AK (a ciphertext); kept over
 * a lock so a server that plays back an older one cannot throw the device back (review of K-402)
 */
export const STATE_ITEM = "kennwort-state";

/** The browser's session area, or undefined where there is none (a page, a test, an old browser) */
export const browserSessionArea = (): SessionArea | undefined =>
  (globalThis as { chrome?: { storage?: { session?: SessionArea } } }).chrome?.storage?.session;

/**
 * Keeps the area from content scripts, which run inside web pages. Chrome's default is the same
 * today; asking for it explicitly keeps it so if the default ever changes. Called once by the
 * service worker at start, before anything is stored.
 */
export const restrictToTrustedContexts = async (
  area: SessionArea | undefined,
): Promise<Result<void, KeyError>> => {
  if (!area) return err("unavailable");
  try {
    await area.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
    return ok(undefined);
  } catch {
    return err("storage-failed");
  }
};

// Chrome keeps only JSON-like values in its storage areas (a Uint8Array comes back as an empty
// object), so bytes go in as arrays of numbers
const encode = (keys: Keys): Record<string, number[]> =>
  Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, Array.from(key)]));

const isByteArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);

const decode = (stored: unknown): Keys | undefined => {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return undefined;
  const entries = Object.entries(stored);
  if (!entries.every(([, value]) => isByteArray(value))) return undefined;
  return Object.fromEntries(entries.map(([name, value]) => [name, Uint8Array.from(value)]));
};

/**
 * Store, read and clear one item of the area: the unlocked keys, or the device's account (both
 * gone when the browser closes); every call answers with a value, never a throw
 */
export const createSessionKeys = (area: SessionArea | undefined, item = KEYS_ITEM) => {
  const attempt = async <T>(run: (area: SessionArea) => Promise<Result<T, KeyError>>) => {
    if (!area) return err("unavailable" as const);
    try {
      return await run(area);
    } catch {
      return err("storage-failed" as const);
    }
  };
  return {
    /** Replaces the stored keys with these: unlocking sets them all at once */
    store: (keys: Keys) =>
      attempt(async (session) => ok(await session.set({ [item]: encode(keys) }))),
    /** The stored keys, or undefined when locked */
    read: () =>
      attempt<Keys | undefined>(async (session) => {
        const stored = (await session.get(item))[item];
        if (stored === undefined) return ok(undefined);
        const keys = decode(stored);
        return keys ? ok(keys) : err("malformed");
      }),
    /** Locks: the keys are gone from the area */
    clear: () => attempt(async (session) => ok(await session.remove(item))),
  };
};

export type SessionKeys = ReturnType<typeof createSessionKeys>;
