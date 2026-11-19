/**
 * A server stand-in that keeps records in memory (P-21): it accepts a record only as the next
 * version of its entry and answers a conflict with the current one. The tests use it; K-207 grows
 * it into the browser stand-in for the demo.
 */
import { idKey } from "../membership/verify-log.ts";
import type { EntryRecord } from "./record.ts";

export type PushResult = { ok: true } | { ok: false; current: EntryRecord | undefined };
export type SyncServer = { push: (record: EntryRecord) => PushResult; pull: () => EntryRecord[] };

export const memoryServer = (): SyncServer => {
  const records = new Map<string, EntryRecord>();
  return {
    push: (record) => {
      const current = records.get(idKey(record.entryId));
      if ((current?.version ?? 0) + 1 !== record.version) return { ok: false, current };
      records.set(idKey(record.entryId), record);
      return { ok: true };
    },
    pull: () => [...records.values()],
  };
};
