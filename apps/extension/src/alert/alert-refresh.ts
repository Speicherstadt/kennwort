/**
 * Keeps the alert list (alert-list.ts) in step with the open account's entries (K-405): the popup,
 * the inline menu and the save prompt call it whenever their entries are loaded or changed. Only
 * extension pages hold decrypted entries (P-17), so only they can make the tags; the service worker
 * and the content script never see a saved password.
 *
 * Only while unlocked: it writes nothing when the keys are gone and takes the list away again if
 * the lock came while it worked. The salt stays while unlocked, so a record whose entry did not
 * change is kept; each new tag costs some milliseconds of Argon2id (F-10), so it pauses between
 * tags and writes what it has every BATCH tags, for a popup that closes before it is done.
 */
import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { ALERT_SALT_LENGTH, alertHostTag, alertTag, randomBytes } from "@kennwort/crypto";
import { ALERT_ITEM, browserSessionArea, KEYS_ITEM, type SessionArea } from "../session-keys.ts";
import {
  type AlertRecord,
  type AlertSource,
  alertListOf,
  alertSources,
  type Hashers,
  recordOf,
  reusableRecords,
} from "./alert-list.ts";
import { fromHex, hex } from "./hex.ts";

const BATCH = 10;

export type AlertRefreshDeps = {
  area: SessionArea | undefined;
  random: (length: number) => Uint8Array;
  hashers?: Hashers;
  /** Between two tags, so the page stays responsive */
  pause?: () => Promise<void>;
};

const F09: Hashers = { tag: alertTag, hostTag: alertHostTag };
const nextTask = () => new Promise<void>((done) => setTimeout(done, 0));

const isUnlocked = async (area: SessionArea) =>
  (await area.get(KEYS_ITEM))[KEYS_ITEM] !== undefined;

/** Writes the list only while unlocked; a lock that came meanwhile takes it away again */
const writeList = async (area: SessionArea, salt: string, records: AlertRecord[]) => {
  if (!(await isUnlocked(area))) return false;
  await area.set({ [ALERT_ITEM]: { salt, records } });
  if (await isUnlocked(area)) return true;
  await area.remove(ALERT_ITEM);
  return false;
};

/** One pass over the entries: kept records as they are, new tags for the rest */
const refreshOnce = async (
  area: SessionArea,
  entries: readonly StoredEntry[],
  deps: AlertRefreshDeps,
) => {
  if (!(await isUnlocked(area))) return;
  const stored = alertListOf((await area.get(ALERT_ITEM))[ALERT_ITEM]);
  const salt = stored?.salt ?? hex(deps.random(ALERT_SALT_LENGTH));
  const reusable = reusableRecords(stored, salt);
  const sources = alertSources(entries);
  const keyOf = (source: AlertSource) => `${source.id}/${source.version}`;
  const fresh = new Map<string, AlertRecord>();
  // In the order of the entries: kept records as they are, new ones as far as they are made
  const records = () =>
    sources.flatMap((source) => reusable.get(keyOf(source)) ?? fresh.get(keyOf(source)) ?? []);
  let written = false;
  for (const source of sources.filter((s) => !reusable.has(keyOf(s)))) {
    await (deps.pause ?? nextTask)();
    fresh.set(keyOf(source), recordOf(source, fromHex(salt), deps.hashers ?? F09));
    written = false;
    if (fresh.size % BATCH !== 0) continue;
    if (!(await writeList(area, salt, records()))) return;
    written = true;
  }
  if (!written) await writeList(area, salt, records());
};

/**
 * Refreshes the list for these entries; calls while one runs are worked through after it, only
 * the newest entries. Never throws: the warning is a help, a failed refresh leaves the old list.
 */
export const createAlertRefresh = (deps: AlertRefreshDeps) => {
  let waiting: readonly StoredEntry[] | undefined;
  let running: Promise<void> | undefined;
  const drain = async () => {
    for (let next = waiting; next; next = waiting) {
      waiting = undefined;
      const area = deps.area;
      if (area) await refreshOnce(area, next, deps).catch(() => undefined);
    }
    running = undefined;
  };
  return (entries: readonly StoredEntry[]): Promise<void> => {
    waiting = entries;
    running ??= drain();
    return running;
  };
};

/** The pages' one refresher over the browser's session area (session-keys.ts) */
let browserRefresh: ReturnType<typeof createAlertRefresh> | undefined;
export const refreshAlertList = (entries: readonly StoredEntry[]) => {
  browserRefresh ??= createAlertRefresh({ area: browserSessionArea(), random: randomBytes });
  return browserRefresh(entries);
};
