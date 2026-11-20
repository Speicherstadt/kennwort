/** Which entries a list shows: by route filter and search text, sorted by title */

import { matchesSearch } from "@kennwort/client/search.ts";
import type { DemoEntry } from "./demo.ts";
import { toChange } from "./entries/to-change.ts";
import type { ListFilter } from "./routes.ts";

/** Entries shared with this account show under "Mit mir geteilt" only, apart from the vaults' own */
const inFilter = (entry: DemoEntry, filter: ListFilter) =>
  filter.kind === "shared"
    ? entry.sharedBy !== undefined
    : entry.sharedBy === undefined &&
      (filter.kind === "all" ||
        (filter.kind === "favorites" && entry.favorite) ||
        (filter.kind === "to-change" && toChange(entry)) ||
        (filter.kind === "vault" && entry.vault === filter.id));

export const shownEntries = (entries: readonly DemoEntry[], filter: ListFilter, search: string) =>
  entries
    .filter((entry) => inFilter(entry, filter) && matchesSearch(entry, search))
    .sort((a, b) => a.title.localeCompare(b.title));

/** How many entries of the vaults are „Zum Ändern“: the sidebar's count and the phone's chip */
export const toChangeCount = (entries: readonly DemoEntry[]) =>
  entries.filter((entry) => !entry.sharedBy && toChange(entry)).length;
