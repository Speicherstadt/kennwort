/**
 * An entry as other managers' formats hold it (K-504): username, password, links, one-time code
 * and notes in their own columns, every other field as a named extra one. CSV and KDBX know no
 * entry types, so a card's number or a key's passphrase becomes such an extra field. The template
 * fields are found by their fixed IDs (import/entry.ts, apps/web's entry-types.ts); a second link
 * is `website-2` and so on, as the import writes it.
 */
import type { ExportedEntry } from "./payload.ts";

export type FlatField = { name: string; value: string; secret: boolean };
export type FlatEntry = {
  title: string;
  type: ExportedEntry["type"];
  favorite: boolean;
  tags: string[];
  username: string;
  password: string;
  urls: string[];
  totp: string;
  notes: string;
  fields: FlatField[];
  /** Earlier passwords, oldest first, with when they were replaced (Unix seconds, as the app keeps it) */
  passwords: { value: string; replacedAt: number }[];
};

/**
 * Whether CSV and KDBX carry the entry: a passkey goes into Kennwort's encrypted JSON only, as
 * its key (F-12) is Kennwort's own and of no use to another manager (docs/import-export.md)
 */
export const flatCarries = (entry: Pick<ExportedEntry, "type">) => entry.type !== "passkey";

const isUrl = (id: string) => /^website(-\d+)?$/.test(id);
const MAIN = new Set(["username", "password", "totp", "note"]);

export const flatEntry = (entry: ExportedEntry): FlatEntry => {
  const filled = entry.fields.filter((field) => field.value !== "");
  const first = (id: string) => filled.find((field) => field.id === id);
  // Only the first field with a main ID goes into its column; a second one stays an extra field
  const mains = new Set([...MAIN].map((id) => first(id)));
  return {
    title: entry.title,
    type: entry.type,
    favorite: entry.favorite,
    tags: entry.tags,
    username: first("username")?.value ?? "",
    password: first("password")?.value ?? "",
    urls: filled.filter((field) => isUrl(field.id)).map((field) => field.value),
    totp: first("totp")?.value ?? "",
    notes: first("note")?.value ?? "",
    fields: filled
      .filter((field) => !mains.has(field) && !isUrl(field.id))
      .map((field) => ({
        name: field.name.trim() || field.id,
        value: field.value,
        secret: field.kind === "secret" || field.kind === "totp",
      })),
    passwords: entry.history
      .filter((item) => item.fieldId === "password" && item.value !== "")
      .map((item) => ({ value: item.value, replacedAt: item.replacedAt }))
      .sort((a, b) => a.replacedAt - b.replacedAt),
  };
};
