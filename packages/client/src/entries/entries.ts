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

/**
 * A change mark (K-307, P-11): someone who left could read these secret fields until `at` (Unix
 * seconds); account is theirs in base64url, name what the members list calls them, if anyone
 */
export type ShownMark = { account: string; name?: string | null; at: number; fields: string[] };

/** An earlier value of a secret field (K-306 part 5), as the detail shows it */
export type ShownHistory = { fieldId: string; label: string; value: string; replacedAt: number };

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
  tags: string[];
  /** Earlier values of the secret fields there are now, newest first */
  history: ShownHistory[];
  /** „Zum Ändern“ (to-change.ts): a weak password, and how many entries share it (0: none) */
  weak: boolean;
  reused: number;
  /** „Zum Ändern“ after someone left who could read the entry's secrets; the demo has none */
  marks?: ShownMark[];
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
  /** Someone left and the vault key is not rotated yet: nobody writes (P-11) */
  rotationDue?: boolean;
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

/**
 * The earlier values of the entry's secret fields, newest first. The history also keeps a title,
 * a type or another field's value the merge kept (P-21), and a TOTP key; those stay in the
 * content but are not earlier passwords, and a TOTP key shows nowhere in plain text.
 */
const historyOf = (content: EntryContent): ShownHistory[] =>
  content.history
    .flatMap((item) => {
      const field = content.fields.find((f) => f.id === item.fieldId && f.kind === "secret");
      return field ? [{ ...item, label: labelOf(content, field) }] : [];
    })
    .sort((a, b) => b.replacedAt - a.replacedAt);

/** The marks with the labels of the fields they name, as far as the entry still has them */
const marksOf = (content: EntryContent): ShownMark[] =>
  (content.toChange ?? []).map((mark) => ({
    account: mark.account,
    at: mark.at,
    fields: content.fields
      .filter((f) => mark.fields.includes(f.id))
      .map((f) => labelOf(content, f)),
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
  tags: entry.content.tags,
  history: historyOf(entry.content),
  weak: false,
  reused: 0,
  marks: marksOf(entry.content),
  changedAt: 0,
  changedBy: "",
  access: [],
  editable: entry.role !== "read" && !entry.rotationDue,
});
