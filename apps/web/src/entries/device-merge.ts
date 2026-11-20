/**
 * Merging what a pull or a sync brought into a device as it stands now (K-306, review): a load and
 * a save may run at the same time, so neither replaces the device it started from; the newer
 * version of every entry wins, and the queue keeps every change no sync has taken yet.
 */
import { type Device, idKey, type Known, type Pending } from "@kennwort/core";

/** Every entry in its newest version from both sides */
export const newestOf = (
  mine: ReadonlyMap<string, Known>,
  theirs: ReadonlyMap<string, Known>,
): Map<string, Known> => {
  const merged = new Map(mine);
  for (const [key, known] of theirs)
    if ((merged.get(key)?.version ?? 0) < known.version) merged.set(key, known);
  return merged;
};

const sameEntry = (a: Pending) => (b: Pending) => idKey(a.entryId) === idKey(b.entryId);

/**
 * A change made on top of one that was just taken builds on the version that change became, not
 * on the one before it: otherwise the merge would see a conflict with itself
 */
const onTopOf = (op: Pending, known: ReadonlyMap<string, Known>): Pending => {
  const now = known.get(idKey(op.entryId));
  return now ? { ...op, base: { version: now.version, content: now.content } } : op;
};

/** A pull's entries into the device as it is now; its queue stays as it is */
export const withPulled = (now: Device, pulled: Device): Device => ({
  known: newestOf(now.known, pulled.known),
  queue: now.queue,
});

/**
 * A sync's outcome into the device as it is now: the changes it took leave the queue (unless the
 * entry was changed again meanwhile), the ones it could not take stay (or join, if a concurrent
 * save had not queued them)
 */
export const withSynced = (now: Device, sent: Device, synced: Device): Device => {
  const taken = sent.queue.filter((op) => !synced.queue.some(sameEntry(op)));
  // By identity: a change made to the entry after the send is a new op and still has to go
  const left = now.queue
    .filter((op) => !taken.includes(op))
    .map((op) => (taken.some(sameEntry(op)) ? onTopOf(op, synced.known) : op));
  const failed = synced.queue.filter((op) => !left.some(sameEntry(op)));
  return { known: newestOf(now.known, synced.known), queue: [...left, ...failed] };
};
