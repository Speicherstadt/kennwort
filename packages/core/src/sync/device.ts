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
export type Pending = {
  entryId: Uint8Array;
  baseVersion: number;
  base: EntryContent | undefined;
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
  const op = { entryId, baseVersion: known?.version ?? 0, base: known?.content, content };
  return { ...device, queue: [...device.queue, op] };
};

/** Takes every record newer than what the device knows, if it passes the checks of P-09 */
export const pull = (device: Device, server: SyncServer, ctx: SyncContext) => {
  const known = new Map(device.known);
  const refused: Refused[] = [];
  for (const record of server.pull()) {
    const mine = known.get(idKey(record.entryId));
    if (mine && record.version <= mine.version) continue;
    const opened = openRecord(record, ctx.ring, ctx.log, ctx.trust, mine?.version ?? 0);
    if (opened.ok)
      known.set(idKey(record.entryId), {
        entryId: record.entryId,
        version: record.version,
        content: opened.value,
      });
    else refused.push({ entryId: record.entryId, version: record.version, error: opened.error });
  }
  return { device: { ...device, known }, refused };
};

const MAX_ATTEMPTS = 5;

/** The content to push for a change, merged if the entry moved on since the change began */
const contentFor = (op: Pending, current: Known | undefined, now: number) =>
  !current || current.version === op.baseVersion || !op.base
    ? op.content
    : mergeContent(op.base, op.content, current.content, now);

export const sync = (device: Device, server: SyncServer, ctx: SyncContext) => {
  let state = pull(device, server, ctx);
  const refused = [...state.refused];
  const left: Pending[] = [];
  for (const op of state.device.queue) {
    let done = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt++) {
      const current = state.device.known.get(idKey(op.entryId));
      const content = contentFor(op, current, ctx.now);
      const version = (current?.version ?? 0) + 1;
      const record = sealRecord(ctx.author, ctx.ring, op.entryId, version, content, ctx.lastSeen);
      if (server.push(record).ok) {
        const known = new Map(state.device.known).set(idKey(op.entryId), {
          entryId: op.entryId,
          version,
          content,
        });
        state = { ...state, device: { ...state.device, known } };
        done = true;
      } else {
        state = pull(state.device, server, ctx);
        refused.push(...state.refused);
      }
    }
    if (!done) left.push(op);
  }
  return { device: { ...state.device, queue: left }, refused };
};
