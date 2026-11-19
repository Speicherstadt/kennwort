/**
 * A device's side of the sync (docs/sicherheitsdesign.md, P-21): changes wait in a queue while the
 * device is offline; on sync it pulls, checks every record (P-09) and pushes each change as the
 * next version. If someone else was faster, it merges three ways against the version the change
 * started from, so nothing is lost.
 */
import type { LogState, Trust } from "../membership/verify-log.ts";
import { idKey } from "../membership/verify-log.ts";
import { type EntryContent, mergeContent } from "./content.ts";
import type { SyncServer } from "./memory-server.ts";
import {
  type AcceptError,
  type Author,
  openRecord,
  sealRecord,
  type VaultKeyring,
} from "./record.ts";

export type Known = { entryId: Uint8Array; version: number; content: EntryContent };
/** A change; base is the version it started from, absent for a new entry */
export type Pending = {
  entryId: Uint8Array;
  base: { version: number; content: EntryContent } | undefined;
  content: EntryContent;
};
export type Device = { known: ReadonlyMap<string, Known>; queue: readonly Pending[] };
export type SyncContext = {
  author: Author;
  ring: VaultKeyring;
  log: LogState;
  trust: Trust;
  lastSeen: Uint8Array;
  now: number;
};
export type Refused = { entryId: Uint8Array; version: number; error: AcceptError };

export const emptyDevice = (): Device => ({ known: new Map(), queue: [] });

/** Queues a change; a second change to the same entry before a sync keeps the first one's base */
export const edit = (device: Device, entryId: Uint8Array, content: EntryContent): Device => {
  const queued = device.queue.find((op) => idKey(op.entryId) === idKey(entryId));
  if (queued) {
    return {
      ...device,
      queue: device.queue.map((op) => (op === queued ? { ...op, content } : op)),
    };
  }
  const known = device.known.get(idKey(entryId));
  const base = known && { version: known.version, content: known.content };
  const op = { entryId, base, content };
  return { ...device, queue: [...device.queue, op] };
};

/** Takes every record newer than what the device knows, if it passes the checks of P-09 */
export type Pulled = { device: Device; refused: Refused[] };

export const pull = (device: Device, server: SyncServer, ctx: SyncContext): Pulled => {
  const known = new Map(device.known);
  const refused: Refused[] = [];
  for (const record of server.pull()) {
    const mine = known.get(idKey(record.entryId));
    const opened = openRecord(record, ctx.ring, ctx.log, ctx.trust, mine?.version ?? 0);
    if (opened.ok)
      known.set(idKey(record.entryId), {
        entryId: record.entryId,
        version: record.version,
        content: opened.value,
      });
    // A version the device already has is no news, not an attack
    else if (opened.error !== "stale")
      refused.push({ entryId: record.entryId, version: record.version, error: opened.error });
  }
  return { device: { ...device, known }, refused };
};

const MAX_ATTEMPTS = 5;

/** The content to push for a change, merged if the entry moved on since the change began */
const contentFor = (op: Pending, current: Known | undefined, now: number) =>
  op.base && current && current.version !== op.base.version
    ? mergeContent(op.base.content, op.content, current.content, now)
    : op.content;

/** Pushes one change as the next version, pulling and merging again when someone was faster */
const pushChange = (
  start: ReturnType<typeof pull>,
  op: Pending,
  server: SyncServer,
  ctx: SyncContext,
) => {
  let state = start;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = state.device.known.get(idKey(op.entryId));
    const content = contentFor(op, current, ctx.now);
    const version = (current?.version ?? 0) + 1;
    if (
      server.push(sealRecord(ctx.author, ctx.ring, op.entryId, version, content, ctx.lastSeen)).ok
    ) {
      const known = new Map(state.device.known).set(idKey(op.entryId), {
        entryId: op.entryId,
        version,
        content,
      });
      return { state: { ...state, device: { ...state.device, known } }, done: true };
    }
    state = pull(state.device, server, ctx);
  }
  return { state, done: false };
};

/** Pulls, then pushes every queued change; what the server keeps refusing stays queued */
export const sync = (device: Device, server: SyncServer, ctx: SyncContext): Pulled => {
  let state: Pulled = pull(device, server, ctx);
  const left: Pending[] = [];
  for (const op of state.device.queue) {
    const result = pushChange(state, op, server, ctx);
    state = result.state;
    if (!result.done) left.push(op);
  }
  return { device: { ...state.device, queue: left }, refused: state.refused };
};
