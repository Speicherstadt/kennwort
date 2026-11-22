/**
 * The security overview (K-603) as data: from the entries this account sees, already marked weak
 * and reused by „Zum Ändern“ (to-change.ts), the lists of what to change, and the monthly report
 * as counts per vault. Entries shared with this account are left out, as under „Zum Ändern“: they
 * can only be read here and are changed in their own vault. Nothing here holds a password beyond
 * the entries it is given; the report holds no title at all.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { LeakCounts } from "@kennwort/core";
import { checkedPasswords } from "../entries/to-change.ts";

/** How often the list of leaked passwords has an entry's password, by entry ID */
export type LeakedEntries = ReadonlyMap<string, number>;

export type Overview = {
  weak: ShownEntry[];
  reused: ShownEntry[];
  leaked: ShownEntry[];
  marked: ShownEntry[];
};

const own = (entries: readonly ShownEntry[]) =>
  entries
    .filter((entry) => entry.sharedBy === undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

const isMarked = (entry: ShownEntry) => (entry.marks?.length ?? 0) > 0;

/** The passwords the check looks at: the checked ones of the account's own entries */
export const passwordsToCheck = (entries: readonly ShownEntry[]) =>
  own(entries).flatMap(checkedPasswords);

/** For each entry with a leaked password, the highest count among its checked passwords */
export const leakedByEntry = (entries: readonly ShownEntry[], counts: LeakCounts): LeakedEntries =>
  new Map(
    own(entries).flatMap((entry) => {
      const found = checkedPasswords(entry).map((password) => counts.get(password) ?? 0);
      const most = Math.max(0, ...found);
      return most > 0 ? [[entry.id, most] as const] : [];
    }),
  );

export const overviewOf = (entries: readonly ShownEntry[], leaked: LeakedEntries): Overview => {
  const mine = own(entries);
  return {
    weak: mine.filter((entry) => entry.weak),
    reused: mine.filter((entry) => entry.reused > 1),
    leaked: mine.filter((entry) => leaked.has(entry.id)),
    marked: mine.filter(isMarked),
  };
};

/** One vault in the monthly report: only counts; leaked is undefined while the check is off */
export type ReportRow = {
  vault: string;
  name: string;
  entries: number;
  weak: number;
  reused: number;
  leaked: number | undefined;
  marked: number;
};

export const reportOf = (
  entries: readonly ShownEntry[],
  leaked: LeakedEntries | undefined,
  vaultName: (id: string) => string,
): ReportRow[] => {
  const byVault = Map.groupBy(own(entries), (entry) => entry.vault);
  return [...byVault]
    .map(([vault, inVault]) => ({
      vault,
      name: vaultName(vault),
      entries: inVault.length,
      weak: inVault.filter((entry) => entry.weak).length,
      reused: inVault.filter((entry) => entry.reused > 1).length,
      leaked: leaked && inVault.filter((entry) => leaked.has(entry.id)).length,
      marked: inVault.filter(isMarked).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
