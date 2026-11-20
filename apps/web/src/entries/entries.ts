/**
 * Entries as the app shows them (K-306): the decrypted content of an entry from a vault mapped to
 * what the list and the detail need, and the content of a new or changed login. The fields of a
 * login carry fixed IDs, so the app finds username, password and website whatever their name.
 */
import type { EntryContent, VaultRole } from "@kennwort/core";

/** What list, detail and filter show of an entry; the demo's entries have the same shape */
export type ShownEntry = {
  id: string;
  title: string;
  username: string;
  password: string;
  website: string;
  vault: string;
  favorite: boolean;
  weak: boolean;
  changedAt: number;
  changedBy: string;
  access: string[];
  /** false in a vault this account may only read; the demo's entries leave it out */
  editable?: boolean;
};

export type LoginInput = { title: string; username: string; password: string; website: string };
export type FieldNames = { username: string; password: string; website: string };

export const FIELD = { username: "username", password: "password", website: "website" } as const;

const fieldValue = (content: EntryContent, id: string) =>
  content.fields.find((field) => field.id === id)?.value ?? "";

/** The content of a login; field names are labels for other apps, the IDs are what counts here */
export const loginContent = (
  input: LoginInput,
  names: FieldNames,
  base?: EntryContent,
): EntryContent => ({
  type: base?.type ?? "login",
  title: input.title.trim(),
  fields: [
    { id: FIELD.username, name: names.username, value: input.username, kind: "text" },
    { id: FIELD.password, name: names.password, value: input.password, kind: "secret" },
    { id: FIELD.website, name: names.website, value: input.website.trim(), kind: "url" },
    // fields this app does not know yet stay as they were
    ...(base?.fields.filter((f) => !Object.values(FIELD).includes(f.id as never)) ?? []),
  ],
  tags: base?.tags ?? [],
  favorite: base?.favorite ?? false,
  history: base?.history ?? [],
});

export const loginOf = (content: EntryContent): LoginInput => ({
  title: content.title,
  username: fieldValue(content, FIELD.username),
  password: fieldValue(content, FIELD.password),
  website: fieldValue(content, FIELD.website),
});

export type StoredEntry = {
  idText: string;
  vaultIdText: string;
  role: VaultRole;
  version: number;
  content: EntryContent;
};

/** An entry from a vault as list and detail show it */
export const shown = (entry: StoredEntry): ShownEntry => ({
  id: entry.idText,
  ...loginOf(entry.content),
  vault: entry.vaultIdText,
  favorite: entry.content.favorite,
  weak: false,
  changedAt: 0,
  changedBy: "",
  access: [],
  editable: entry.role !== "read",
});
