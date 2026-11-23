/**
 * A server stand-in that keeps records in memory (P-21): it accepts a record only as the next
 * version of its entry and answers a conflict with the current one. The tests use it; K-207 grows
 * it into the browser stand-in for the demo.
 */
import { idKey } from "../membership/verify-log.ts";
import type { EntryRecord } from "./record.ts";

export type PushResult = { ok: true } | { ok: false; current: EntryRecord | undefined };
/** What a device needs from a server: the memory stand-in answers at once, HTTP later (K-204) */
export type SyncServer = {
  push: (record: EntryRecord) => PushResult | Promise<PushResult>;
  pull: () => EntryRecord[] | Promise<EntryRecord[]>;
  /** Every version of one entry the server keeps, oldest first: a re-save after a demotion (P-09) */
  versions?: (entryId: Uint8Array) => EntryRecord[] | Promise<EntryRecord[]>;
};
type MemoryServer = {
  push: (record: EntryRecord) => PushResult;
  pull: () => EntryRecord[];
  versions: (entryId: Uint8Array) => EntryRecord[];
};

export const memoryServer = (): MemoryServer => {
  const records = new Map<string, EntryRecord>();
  const history: EntryRecord[] = [];
  return {
    push: (record) => {
      const current = records.get(idKey(record.entryId));
      if ((current?.version ?? 0) + 1 !== record.version) return { ok: false, current };
      records.set(idKey(record.entryId), record);
      history.push(record);
      return { ok: true };
    },
    pull: () => [...records.values()],
    versions: (entryId) => history.filter((r) => idKey(r.entryId) === idKey(entryId)),
  };
};
