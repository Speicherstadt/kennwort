/**
 * Entries as the app shows them (K-306): the decrypted content of an entry from a vault mapped to
 * what the list and the detail need: the type's fields with their labels, and a login's username,
 * password and website by their fixed IDs (entry-types.ts), whatever names another device stored.
 */
import type { EntryContent, VaultRole } from "@kennwort/core";
import { type EntryType, labelOf } from "./entry-types.ts";

/** A field as the detail shows it: its label in the app's language, its value and kind */
export type ShownField = {
  id: string;
  label: string;
  value: string;
  kind: EntryContent["fields"][number]["kind"];
};

/** What list, detail and filter show of an entry; the demo's entries have the same shape */
export type ShownEntry = {
  id: string;
  type: EntryType;
  title: string;
  /** What the list shows under the title: the first filled field that is not secret or long */
  subtitle: string;
  fields: ShownField[];
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
  /** Who shared it with this account (P-10); only entries from "Mit mir geteilt" have it */
  sharedBy?: string;
};

export type LoginInput = { title: string; username: string; password: string; website: string };
const fieldValue = (content: EntryContent, id: string) =>
  content.fields.find((field) => field.id === id)?.value ?? "";

export const loginOf = (content: EntryContent): LoginInput => ({
  title: content.title,
  username: fieldValue(content, "username"),
  password: fieldValue(content, "password"),
  website: fieldValue(content, "website"),
});

export type StoredEntry = {
  idText: string;
  vaultIdText: string;
  role: VaultRole;
  version: number;
  content: EntryContent;
};

const shownFields = (content: EntryContent): ShownField[] =>
  content.fields.map((f) => ({
    id: f.id,
    label: labelOf(content, f),
    value: f.value,
    kind: f.kind,
  }));

export const subtitleOf = (fields: readonly ShownField[]) =>
  fields.find(
    (f) => f.value !== "" && (f.kind === "text" || f.kind === "url" || f.kind === "email"),
  )?.value ?? "";

/** An entry from a vault as list and detail show it */
export const shown = (entry: StoredEntry): ShownEntry => ({
  id: entry.idText,
  type: entry.content.type,
  subtitle: subtitleOf(shownFields(entry.content)),
  fields: shownFields(entry.content),
  ...loginOf(entry.content),
  vault: entry.vaultIdText,
  favorite: entry.content.favorite,
  weak: false,
  changedAt: 0,
  changedBy: "",
  access: [],
  editable: entry.role !== "read",
});
