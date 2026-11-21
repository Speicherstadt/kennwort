/**
 * Merging what a pull or a sync brought into a device as it stands now (K-306, review): a load and
 * a save may run at the same time, so neither replaces the device it started from; the newer
 * version of every entry wins, and the queue keeps every change no sync has taken yet.
 */
import { type Device, idKey, type Known, mergeContent, type Pending } from "@kennwort/core";

/**
 * Whether theirs replaces mine: a newer version in no older epoch. A pull that started from the
 * device before a rotation wrote the entry anew may bring a newer version of the old epoch, which
 * only a writer kept from the rotation makes; the entry's epoch never goes back (P-11)
 */
const replaces = (mine: Known | undefined, theirs: Known) =>
  !mine || (mine.version < theirs.version && (mine.key?.epoch ?? 0) <= (theirs.key?.epoch ?? 0));

/** Every entry in its newest version from both sides */
export const newestOf = (
  mine: ReadonlyMap<string, Known>,
  theirs: ReadonlyMap<string, Known>,
): Map<string, Known> => {
  const merged = new Map(mine);
  for (const [key, known] of theirs) if (replaces(merged.get(key), known)) merged.set(key, known);
  return merged;
};

const sameEntry = (a: Pending) => (b: Pending) => idKey(a.entryId) === idKey(b.entryId);

/**
 * A change made on top of one that was just taken builds on the version that change became, not
 * on the one before it, or the merge would see a conflict with itself. That version may hold
 * another device's change, merged in by the sync: the waiting change is merged onto it, and where
 * both changed a field it wins, as the newer edit of this device (the other value goes to the
 * history).
 */
const onTopOf = (op: Pending, known: ReadonlyMap<string, Known>, now: number): Pending => {
  const became = known.get(idKey(op.entryId));
  if (!became || !op.base) return op;
  return {
    ...op,
    base: { version: became.version, content: became.content },
    content: mergeContent(op.base.content, became.content, op.content, now),
  };
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
export const withSynced = (now: Device, sent: Device, synced: Device, time: number): Device => {
  const taken = sent.queue.filter((op) => !synced.queue.some(sameEntry(op)));
  // By identity: a change made to the entry after the send is a new op and still has to go
  const left = now.queue
    .filter((op) => !taken.includes(op))
    .map((op) => (taken.some(sameEntry(op)) ? onTopOf(op, synced.known, time) : op));
  const failed = synced.queue.filter((op) => !left.some(sameEntry(op)));
  return { known: newestOf(now.known, synced.known), queue: [...left, ...failed] };
};
