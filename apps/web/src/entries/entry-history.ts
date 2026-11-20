/**
 * Earlier passwords (K-306 part 5): when a change replaces the value of a secret field, the old
 * value goes into the entry's history with the time, inside the same ciphertext (P-09). The
 * history keeps the newest values of each field only, so an entry whose password changes every
 * month does not grow without end; values the merge kept (P-21) count toward that cap, but the
 * merge itself never drops one.
 */
import type { EntryContent } from "@kennwort/core";

type StoredField = EntryContent["fields"][number];
type HistoryItem = EntryContent["history"][number];

/** How many earlier values of one field an entry keeps */
export const HISTORY_PER_FIELD = 10;

/**
 * The old values of the secret fields a change replaced or cleared. A field the change removed
 * keeps no history: removing it was the point, and nothing would show its old values.
 */
export const replacedSecrets = (
  before: EntryContent,
  after: readonly StoredField[],
  now: number,
): HistoryItem[] =>
  before.fields.flatMap((old) => {
    const next = after.find((f) => f.id === old.id);
    const replaced = old.kind === "secret" && old.value !== "" && next && next.value !== old.value;
    return replaced ? [{ fieldId: old.id, value: old.value, replacedAt: now }] : [];
  });

/** The newest HISTORY_PER_FIELD values of every field, in the order the history had them */
export const capHistory = (history: readonly HistoryItem[]): HistoryItem[] => {
  const newestFirst = [...history].sort((a, b) => b.replacedAt - a.replacedAt);
  const counts = new Map<string, number>();
  const kept = new Set(
    newestFirst.filter((item) => {
      const count = (counts.get(item.fieldId) ?? 0) + 1;
      counts.set(item.fieldId, count);
      return count <= HISTORY_PER_FIELD;
    }),
  );
  return history.filter((item) => kept.has(item));
};

/** The history after a change: what it had, the values the change replaced, the newest only */
export const historyAfter = (
  before: EntryContent | undefined,
  after: readonly StoredField[],
  now: number,
): HistoryItem[] =>
  before ? capHistory([...before.history, ...replacedSecrets(before, after, now)]) : [];
