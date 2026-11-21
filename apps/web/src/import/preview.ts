/**
 * The preview of an import (K-501), worked out on the device from the parsed file: one row per
 * entry with what may show (title, username, address – never a secret), marked as a duplicate when
 * the target vault or an earlier row of the file has the same title, username and address, and as
 * weak by the rule of „Zum Ändern“ (K-306). Then the contents that get written.
 */
import { loginOf } from "@kennwort/client/entries/entries.ts";
import type { EntryContent, ImportedEntry } from "@kennwort/core";
import { capHistory } from "../entries/entry-history.ts";
import { hasWeakPassword } from "../entries/to-change.ts";

export type PreviewRow = {
  /** The entry's place in the file */
  index: number;
  type: EntryContent["type"];
  title: string;
  username: string;
  url: string;
  folders: string[];
  duplicate: boolean;
  weak: boolean;
};

/** What a duplicate is compared by, as an entry of the vault shows it */
export type Comparable = { title: string; username: string; website: string };

/** An address as compared: no case, no slash at the end, no spaces around */
const normalUrl = (url: string) => url.trim().toLocaleLowerCase().replace(/\/+$/, "");

/** Title, username and address, compared without case and the spaces around them */
const sameKey = (entry: Comparable) =>
  JSON.stringify([
    entry.title.trim().toLocaleLowerCase(),
    entry.username.trim().toLocaleLowerCase(),
    normalUrl(entry.website),
  ]);

export const previewRows = (
  entries: readonly ImportedEntry[],
  existing: readonly Comparable[],
): PreviewRow[] => {
  const seen = new Set(existing.map(sameKey));
  return entries.map(({ content, folders }, index) => {
    const login = loginOf(content);
    const key = sameKey(login);
    const duplicate = seen.has(key);
    seen.add(key);
    return {
      index,
      type: content.type,
      title: content.title,
      username: login.username,
      url: login.website,
      folders,
      duplicate,
      weak: hasWeakPassword(content),
    };
  });
};

/** How many entries of each type, the most frequent first */
export const countByType = (entries: readonly ImportedEntry[]) => {
  const counts = new Map<EntryContent["type"], number>();
  for (const { content } of entries) counts.set(content.type, (counts.get(content.type) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

export type ImportChoices = {
  /** Duplicates to import anyway, by their place in the file */
  take: ReadonlySet<number>;
  /** The other manager's folders as tags of the entry */
  foldersAsTags: boolean;
};

const contentOf = ({ content, folders }: ImportedEntry, foldersAsTags: boolean): EntryContent => ({
  ...content,
  tags: foldersAsTags
    ? [...new Set([...content.tags, ...folders])].sort((a, b) => a.localeCompare(b))
    : content.tags,
  history: capHistory(content.history),
});

/** The contents to write: every row but the duplicates not taken anyway */
export const contentsToImport = (
  entries: readonly ImportedEntry[],
  rows: readonly PreviewRow[],
  choices: ImportChoices,
): EntryContent[] =>
  rows
    .filter((row) => !row.duplicate || choices.take.has(row.index))
    .flatMap((row) => {
      const entry = entries[row.index];
      return entry ? [contentOf(entry, choices.foldersAsTags)] : [];
    });
