/**
 * The preview of an import (K-501), worked out on the device from the parsed file: one row per
 * entry with what may show (title, username, address – never a secret), marked as a duplicate when
 * the target vault or an earlier row of the file has the same title, username and address, and as
 * weak by the rule of „Zum Ändern“ (K-306). A code from an authenticator app comes with the logins
 * of the vault it could go into (K-503 Teil 2); one that holds this code already makes it a
 * duplicate. Then what gets written: new entries, and codes for the field „Einmalcode“ of a login.
 */
import { loginOf } from "@kennwort/client/entries/entries.ts";
import { capHistory } from "@kennwort/client/entries/entry-history.ts";
import type { ImportWrite } from "@kennwort/client/entries/entry-import.ts";
import {
  type CodeState,
  codeCandidates,
  codeOf,
  type EntryContent,
  type ImportedEntry,
  type VaultLogin,
} from "@kennwort/core";
import { hasWeakPassword } from "../entries/to-change.ts";

/** A login of the vault a code could go into, as the preview names it; never its code */
export type CodeTarget = { id: string; title: string; username: string; state: CodeState };

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
  /** The logins a code could go into; empty for an entry that is no code or has no match */
  targets: CodeTarget[];
};

/** What duplicates and codes are compared by, as an entry of the vault shows it */
export type Comparable = VaultLogin & { username: string; website: string };

/** An address as compared: no case, no slash at the end, no spaces around */
const normalUrl = (url: string) => url.trim().toLocaleLowerCase().replace(/\/+$/, "");

/** Title, username and address, compared without case and the spaces around them */
const sameKey = (entry: Pick<Comparable, "title" | "username" | "website">) =>
  JSON.stringify([
    entry.title.trim().toLocaleLowerCase(),
    entry.username.trim().toLocaleLowerCase(),
    normalUrl(entry.website),
  ]);

const codeTargets = (content: EntryContent, existing: readonly Comparable[]): CodeTarget[] =>
  codeCandidates(content, existing).flatMap(({ id, state }) => {
    const login = existing.find((e) => e.id === id);
    return login ? [{ id, title: login.title, username: login.username, state }] : [];
  });

/**
 * A duplicate is in the vault already (for a code: a login offered has it, while a match alone is
 * none) or in an earlier row of the file
 */
export const previewRows = (
  entries: readonly ImportedEntry[],
  existing: readonly Comparable[],
): PreviewRow[] => {
  const inVault = new Set(existing.map(sameKey));
  const inFile = new Set<string>();
  return entries.map(({ content, folders }, index) => {
    const login = loginOf(content);
    const key = sameKey(login);
    const targets = codeTargets(content, existing);
    const known = targets.length > 0 ? targets.some((t) => t.state === "same") : inVault.has(key);
    const duplicate = known || inFile.has(key);
    inFile.add(key);
    return {
      index,
      type: content.type,
      title: content.title,
      username: login.username,
      url: login.website,
      folders,
      duplicate,
      weak: hasWeakPassword(content),
      targets,
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
  /** Where the person put a row's code: a login's ID, or "" for a login of its own */
  targets: ReadonlyMap<number, string>;
};

/** Where a code goes unless the person says otherwise: the only login offered, if it has no code */
export const defaultTarget = (row: PreviewRow) => {
  const [only, ...more] = row.targets;
  return only?.state === "free" && more.length === 0 ? only.id : "";
};

/** The login a row's code goes into, or "" for its own: never one with a code or not offered */
export const targetOf = (row: PreviewRow, chosen: ImportChoices["targets"]) => {
  const id = chosen.get(row.index) ?? defaultTarget(row);
  const free = row.targets.some((t) => t.id === id && t.state === "free");
  return free && !row.duplicate ? id : "";
};

const contentOf = ({ content, folders }: ImportedEntry, foldersAsTags: boolean): EntryContent => ({
  ...content,
  tags: foldersAsTags
    ? [...new Set([...content.tags, ...folders])].sort((a, b) => a.localeCompare(b))
    : content.tags,
  history: capHistory(content.history),
});

/**
 * What to write: every row but the duplicates not taken anyway, a code into the login chosen for
 * it; a second code for the same login becomes a login of its own instead of replacing the first
 */
export const contentsToImport = (
  entries: readonly ImportedEntry[],
  rows: readonly PreviewRow[],
  choices: ImportChoices,
): ImportWrite[] => {
  const used = new Set<string>();
  return rows
    .filter((row) => !row.duplicate || choices.take.has(row.index))
    .flatMap((row): ImportWrite[] => {
      const entry = entries[row.index];
      if (!entry) return [];
      const target = targetOf(row, choices.targets);
      const code = codeOf(entry.content);
      if (target === "" || !code || used.has(target))
        return [{ kind: "new", content: contentOf(entry, choices.foldersAsTags) }];
      used.add(target);
      return [{ kind: "code", entryIdText: target, totp: code.totp }];
    });
};
