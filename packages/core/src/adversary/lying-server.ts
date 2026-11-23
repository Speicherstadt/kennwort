/**
 * A server that lies on purpose (K-206, docs/sicherheitsdesign.md "Angriffe als Tests"): it wraps
 * an honest one and changes what it answers, the way a compromised server would in the ETH study.
 * The tests run each attack against the client's checks; K-701 adds the rest, K-207 reuses it.
 */
import type { PushResult, SyncServer } from "../sync/memory-server.ts";
import type { EntryRecord } from "../sync/record.ts";

export type Lie = {
  /** Changes the records a device pulls */
  pull?: (records: EntryRecord[]) => EntryRecord[];
  /** Answers a push itself instead of the honest server; undefined lets it through */
  push?: (record: EntryRecord) => PushResult | undefined;
  /** Changes the versions of an entry a device asks for */
  versions?: (records: EntryRecord[]) => EntryRecord[];
};

export const lyingServer = (honest: SyncServer, lie: Lie): SyncServer => ({
  pull: async () => {
    const records = await honest.pull();
    return lie.pull ? lie.pull(records) : records;
  },
  push: async (record) => lie.push?.(record) ?? honest.push(record),
  versions: async (entryId) => {
    const records = (await honest.versions?.(entryId)) ?? [];
    return lie.versions ? lie.versions(records) : records;
  },
});

/** Flips one byte, as a server that tampers with a ciphertext or a signature would */
export const flipByte = (bytes: Uint8Array, at = bytes.length - 1) =>
  bytes.map((byte, i) => (i === at ? byte ^ 0x01 : byte));
