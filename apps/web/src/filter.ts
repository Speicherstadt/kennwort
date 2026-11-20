/** Which entries a list shows: by route filter and search text, sorted by title */
import type { DemoEntry } from "./demo.ts";
import type { ListFilter } from "./routes.ts";

/** Entries shared with this account show under "Mit mir geteilt" only, apart from the vaults' own */
const inFilter = (entry: DemoEntry, filter: ListFilter) =>
  filter.kind === "shared"
    ? entry.sharedBy !== undefined
    : entry.sharedBy === undefined &&
      (filter.kind === "all" ||
        (filter.kind === "favorites" && entry.favorite) ||
        (filter.kind === "to-change" && entry.weak) ||
        (filter.kind === "vault" && entry.vault === filter.id));

const matches = (entry: DemoEntry, search: string) => {
  const needle = search.trim().toLocaleLowerCase();
  return (
    needle === "" ||
    [entry.title, entry.username, entry.website].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    )
  );
};

export const shownEntries = (entries: readonly DemoEntry[], filter: ListFilter, search: string) =>
  entries
    .filter((entry) => inFilter(entry, filter) && matches(entry, search))
    .sort((a, b) => a.title.localeCompare(b.title));
