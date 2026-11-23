/**
 * What the popup lists (K-402): the entries for the page by exact host (page/matches.ts), and the
 * entries the search and the favorites filter leave, by title. The search is the web app's
 * (packages/client/src/search.ts): it never looks into secret values.
 */

import { matchesHost } from "@kennwort/client/autofill/matches.ts";
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { matchesSearch } from "@kennwort/client/search.ts";

const byTitle = (a: ShownEntry, b: ShownEntry) => a.title.localeCompare(b.title);

export const forPage = (entries: readonly ShownEntry[], host: string | undefined) =>
  entries.filter((entry) => matchesHost(entry, host)).sort(byTitle);

export const listed = (entries: readonly ShownEntry[], search: string, favoritesOnly: boolean) =>
  entries
    .filter((entry) => (!favoritesOnly || entry.favorite) && matchesSearch(entry, search))
    .sort(byTitle);
