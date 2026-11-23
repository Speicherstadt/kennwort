/**
 * A device's side of the sync (docs/sicherheitsdesign.md, P-21): changes wait in a queue while the
 * device is offline; on sync it pulls, checks every record (P-09) and pushes each change as the
 * next version. If someone else was faster, it merges three ways against the version the change
 * started from, so nothing is lost.
 */
import type { LogState, Trust } from "../membership/verify-log.ts";
import { idKey } from "../membership/verify-log.ts";
import { markForChange, marksOf, settleMarks, withMarks } from "./change-marks.ts";
import { type EntryContent, mergeContent } from "./content.ts";
import type { SyncServer } from "./memory-server.ts";
import {
  type AcceptError,
  type Author,
  type EntryKey,
  entryKeyFor,
  openRecordWithKey,
  sealRecord,
  type VaultKeyring,
} from "./record.ts";

/**
 * An entry as the device knows it; key is the entry key it was opened or sealed with, kept only in
 * memory, so the next version keeps it and a share covers that version too (P-09, P-10)
 */
export type Known = { entryId: Uint8Array; version: number; content: EntryContent; key?: EntryKey };
/** Someone who left: their account (base64url), when, and the epochs whose vault key they held */
export type Exposure = { account: string; at: number; epochs: readonly number[] };
/**
 * A change; base is the version it started from, absent for a new entry. rekey seals it under a
 * new entry key, whatever key a pull brings meanwhile: revoking a share (P-10). exposedTo marks the
 * secrets of the version it replaces "to change" if that version lay in an epoch the person who
 * left could read (P-11)
 */
export type Pending = {
  entryId: Uint8Array;
  base: { version: number; content: EntryContent } | undefined;
  content: EntryContent;
  rekey?: true;
  exposedTo?: Exposure;
};
export type Device = { known: ReadonlyMap<string, Known>; queue: readonly Pending[] };
export type SyncContext = {
  author: Author;
  /** The vault key of the log's current epoch: every version is written under it */
  ring: VaultKeyring;
  /** Keys of earlier epochs, to read versions a rotation has not re-encrypted yet (P-11) */
  older?: readonly VaultKeyring[];
  log: LogState;
  trust: Trust;
  lastSeen: Uint8Array;
  now: number;
  /**
   * Everyone who left the vault (pastExposures): a write that replaces a version of an epoch one of
   * them held marks its secrets, also when the server hid the entry from the rotation (P-11)
   */
  exposures?: readonly Exposure[];
};
/**
 * A record the device would not take, ("missing") a known entry the server no longer shows (E-15),
 * ("newer-epoch") a record of an epoch the checked log does not reach: the server withholds a
 * rotation or rolled the log back (E-07, E-26), or ("older-epoch") a newer version in an older
 * epoch than the one the device holds the entry in: written by someone the server kept from the
 * rotation, readable for whoever left and without the rotation's marks (P-11, E-08)
 */
export type Refused = {
  entryId: Uint8Array;
  version: number;
  error: AcceptError | "missing" | "rollback" | "newer-epoch" | "older-epoch";
};

export const emptyDevice = (): Device => ({ known: new Map(), queue: [] });

/**
 * The change's content with the change marks of what it changes: marks are the core's, not the
 * caller's, so a dialog that knows nothing of them cannot drop one; a secret the change gives a new
 * value leaves its mark (P-11)
 */
const carryMarks = (previous: EntryContent | undefined, content: EntryContent) =>
  withMarks(content, previous ? settleMarks(marksOf(previous), previous, content) : []);

/** Queues a change; a second change to the same entry before a sync keeps the first one's base */
export const edit = (device: Device, entryId: Uint8Array, content: EntryContent): Device => {
  const queued = device.queue.find((op) => idKey(op.entryId) === idKey(entryId));
  if (queued) {
    const next = carryMarks(queued.content, content);
    return {
      ...device,
      queue: device.queue.map((op) => (op === queued ? { ...op, content: next } : op)),
    };
  }
  const known = device.known.get(idKey(entryId));
  const base = known && { version: known.version, content: known.content };
  const op = { entryId, base, content: carryMarks(known?.content, content) };
  return { ...device, queue: [...device.queue, op] };
};

/**
 * After someone left and the vault key rotated (P-11): every entry the device knows is written
 * again, under the new epoch's key and so under a new entry key, and the secrets of a version the
 * person could read are marked "to change". Queued changes go along and get the marks too. After a
 * member only renewed her keys (P-12) nobody left: no exposure, no marks, the same person stays.
 */
export const rotateEntries = (device: Device, exposure?: Exposure): Device => {
  const queued = new Set(device.queue.map((op) => idKey(op.entryId)));
  const unchanged = [...device.known.values()]
    .filter((known) => !queued.has(idKey(known.entryId)))
    .map((known) => ({
      entryId: known.entryId,
      base: { version: known.version, content: known.content },
      content: known.content,
    }));
  const queue = [...device.queue, ...unchanged].map((op) =>
    exposure ? { ...op, exposedTo: exposure } : op,
  );
  return { ...device, queue };
};

/**
 * Queues the entry's content unchanged, to be sealed under a new entry key: after a share is
 * revoked, the recipient's key opens no later version (P-10). An entry the device does not know
 * stays as it is.
 */
export const rekey = (device: Device, entryId: Uint8Array): Device => {
  const queued = device.queue.find((op) => idKey(op.entryId) === idKey(entryId));
  const content = queued?.content ?? device.known.get(idKey(entryId))?.content;
  if (!content) return device;
  const edited = edit(device, entryId, content);
  return {
    ...edited,
    queue: edited.queue.map((op) =>
      idKey(op.entryId) === idKey(entryId) ? { ...op, rekey: true as const } : op,
    ),
  };
};

/**
 * Takes every record newer than what the device knows, if it passes the checks of P-09. blocked
 * says why nothing was pushed: the key in hand is not the current epoch's, or someone left and
 * the rotation is still due, so whoever left holds the current key (P-11, E-26)
 */
export type Pulled = { device: Device; refused: Refused[]; blocked?: "stale-key" | "rotation-due" };

/** The key a record of this epoch was sealed under, if the device holds it; else the current one */
export const ringOf = (ctx: SyncContext, epoch: number) =>
  ctx.older?.find((ring) => ring.epoch === epoch) ?? ctx.ring;

/**
 * The records with the versions of each entry in the order they were written, entries as they came:
 * of two versions of one entry in one answer, a newer epoch's is known before an older epoch's
 * newer one is weighed against it (P-11)
 */
export const inVersionOrder = <R extends { entryId: Uint8Array; version: number }>(
  records: readonly R[],
): R[] => {
  const byEntry = Map.groupBy(records, (record) => idKey(record.entryId));
  return [...byEntry.values()].flatMap((versions) =>
    versions.toSorted((a, b) => a.version - b.version),
  );
};

export const pull = async (
  device: Device,
  server: SyncServer,
  ctx: SyncContext,
): Promise<Pulled> => {
  const known = new Map(device.known);
  const refused: Refused[] = [];
  const records = await server.pull();
  for (const record of inVersionOrder(records)) {
    const mine = known.get(idKey(record.entryId));
    const knownVersion = mine?.version ?? 0;
    if (record.epoch > ctx.log.epoch) {
      refused.push({ entryId: record.entryId, version: record.version, error: "newer-epoch" });
      continue;
    }
    const opened = openRecordWithKey(
      record,
      ringOf(ctx, record.epoch),
      ctx.log,
      ctx.trust,
      knownVersion,
    );
    // An entry's epoch never goes back: every honest writer seals the next version under the key
    // of the newest epoch it opened the entry in, and the server takes versions only in the current
    // epoch (P-11). A newer version of an older epoch comes from a writer kept from the rotation.
    if (opened.ok && record.epoch < (mine?.key?.epoch ?? 0))
      refused.push({ entryId: record.entryId, version: record.version, error: "older-epoch" });
    else if (opened.ok)
      known.set(idKey(record.entryId), {
        entryId: record.entryId,
        version: record.version,
        content: opened.value.content,
        key: { entryKey: opened.value.entryKey, epoch: record.epoch },
      });
    // The version the device already has is no news; an older one is a rollback (E-13)
    else if (opened.error !== "stale" || record.version < knownVersion)
      refused.push({
        entryId: record.entryId,
        version: record.version,
        error: opened.error === "stale" ? "rollback" : opened.error,
      });
  }
  // Deleting is a signed tombstone (P-09); an entry that just vanishes is hidden, not gone
  const shown = new Set(records.map((record) => idKey(record.entryId)));
  for (const mine of device.known.values())
    if (!shown.has(idKey(mine.entryId)))
      refused.push({ entryId: mine.entryId, version: mine.version, error: "missing" });
  return { device: { ...device, known }, refused };
};

const MAX_ATTEMPTS = 5;

/** The content to push for a change, merged if the entry moved on since the change began */
const mergedFor = (op: Pending, current: Known | undefined, now: number) =>
  op.base && current && current.version !== op.base.version
    ? mergeContent(op.base.content, op.content, current.content, now)
    : op.content;

/**
 * As merged, and marked "to change" for everyone who left and could read the version it replaces
 * (the rotation's exposure and the exits the context knows): the secrets that still hold the value
 * of that version
 */
const contentFor = (op: Pending, ctx: SyncContext, current: Known | undefined) => {
  const exposures = [...(op.exposedTo ? [op.exposedTo] : []), ...(ctx.exposures ?? [])];
  const epoch = current?.key?.epoch;
  return exposures
    .filter((exposed) => exposed.epochs.includes(epoch as number))
    .reduce(
      (content, exposed) =>
        markForChange(content, exposed.account, exposed.at, (current as Known).content),
      mergedFor(op, current, ctx.now),
    );
};

/** Every refusal once, from all pulls of one sync: a server must not hide one behind a retry */
const allRefused = (lists: Refused[][]) => {
  const seen = new Set<string>();
  return lists.flat().filter((refusal) => {
    const key = `${idKey(refusal.entryId)}:${refusal.version}:${refusal.error}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * The highest version of the entry the device refused as written by someone who may not edit: a
 * re-save goes above it, or it would stay the newest version for good (P-09)
 */
const refusedAbove = (refused: readonly Refused[], entryId: Uint8Array) =>
  Math.max(
    0,
    ...refused
      .filter((r) => r.error === "not-editor" && idKey(r.entryId) === idKey(entryId))
      .map((r) => r.version),
  );

/** Pushes one change as the next version, pulling and merging again when someone was faster */
const pushChange = async (
  start: Pulled,
  op: Pending,
  server: SyncServer,
  ctx: SyncContext,
  seen: Refused[][],
) => {
  let state = start;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = state.device.known.get(idKey(op.entryId));
    const content = contentFor(op, ctx, current);
    const version = Math.max(current?.version ?? 0, refusedAbove(state.refused, op.entryId)) + 1;
    const key = entryKeyFor(ctx.ring, op.rekey ? undefined : current?.key);
    const record = sealRecord(
      ctx.author,
      ctx.ring,
      op.entryId,
      version,
      content,
      ctx.lastSeen,
      key,
    );
    if ((await server.push(record)).ok) {
      const known = new Map(state.device.known).set(idKey(op.entryId), {
        entryId: op.entryId,
        version,
        content,
        key,
      });
      return { state: { ...state, device: { ...state.device, known } }, done: true };
    }
    state = await pull(state.device, server, ctx);
    seen.push(state.refused);
  }
  return { state, done: false };
};

/** Pulls, then pushes every queued change; what the server keeps refusing stays queued */
export const sync = async (
  device: Device,
  server: SyncServer,
  ctx: SyncContext,
): Promise<Pulled> => {
  let state: Pulled = await pull(device, server, ctx);
  // Never a new version under a key the log has moved on from: whoever left may hold it (E-26)
  if (ctx.ring.epoch !== ctx.log.epoch) return { ...state, blocked: "stale-key" };
  // Nor under the current key while a rotation is due: whoever left holds that one too (P-11)
  if (ctx.log.rotationDue) return { ...state, blocked: "rotation-due" };
  const seen = [state.refused];
  const left: Pending[] = [];
  for (const op of state.device.queue) {
    const result = await pushChange(state, op, server, ctx, seen);
    state = result.state;
    if (!result.done) left.push(op);
  }
  return { device: { ...state.device, queue: left }, refused: allRefused(seen) };
};
