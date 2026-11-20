/**
 * What the entry dialog edits (K-306 part 2): the type, the title and the fields, the type's own
 * first in its order, then the owner's. Read from stored content and written back into it; tags,
 * favorite and history ride along untouched.
 */
import type { EntryContent } from "@kennwort/core";
import { type EntryType, TEMPLATES, templateField } from "./entry-types.ts";

type StoredField = EntryContent["fields"][number];
/**
 * A field as the dialog shows it; `own` fields the owner named, may rename and remove; `added` ones
 * were added in this dialog, so one left without a name is dropped (a stored one is kept as it is)
 */
export type InputField = StoredField & { own: boolean; added?: boolean };
export type EntryInput = { type: EntryType; title: string; fields: InputField[] };

/** The type's fields; a stored field keeps the kind it was stored with (review of K-306 part 2) */
const fromTemplate = (type: EntryType, stored: (id: string) => StoredField | undefined) =>
  TEMPLATES[type].map(
    (t): InputField => ({
      id: t.id,
      name: t.label(),
      value: stored(t.id)?.value ?? "",
      kind: stored(t.id)?.kind ?? t.kind,
      own: false,
    }),
  );

export const newInput = (type: EntryType): EntryInput => ({
  type,
  title: "",
  fields: fromTemplate(type, () => undefined),
});

export const inputOf = (content: EntryContent): EntryInput => {
  const stored = (id: string) => content.fields.find((f) => f.id === id);
  const own = content.fields
    .filter((f) => !templateField(content.type, f.id))
    .map((f) => ({ ...f, own: true }));
  return {
    type: content.type,
    title: content.title,
    fields: [...fromTemplate(content.type, stored), ...own],
  };
};

/**
 * Another type for a new entry: its fields take the values of fields with the same ID; a filled
 * field the new type does not have becomes the owner's own, so nothing typed is lost
 */
export const withType = (input: EntryInput, type: EntryType): EntryInput => {
  const field = (id: string) => input.fields.find((f) => f.id === id);
  // A field the new type has goes into its template field, own or not, so no ID comes twice
  const kept = input.fields.filter((f) => !templateField(type, f.id) && (f.own || f.value !== ""));
  return {
    type,
    title: input.title,
    fields: [...fromTemplate(type, field), ...kept.map((f) => ({ ...f, own: true }))],
  };
};

const trimmed = (field: InputField): StoredField => ({
  id: field.id,
  name: field.name.trim(),
  value: field.kind === "url" || field.kind === "email" ? field.value.trim() : field.value,
  kind: field.kind,
});

/** The content to save; a field added in the dialog and left without a name is left out */
export const contentOf = (input: EntryInput, base?: EntryContent): EntryContent => ({
  type: input.type,
  title: input.title.trim(),
  fields: input.fields.filter((f) => !f.added || f.name.trim() !== "").map(trimmed),
  tags: base?.tags ?? [],
  favorite: base?.favorite ?? false,
  history: base?.history ?? [],
});
