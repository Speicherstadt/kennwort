/**
 * The decrypted content of an entry (docs/sicherheitsdesign.md, P-09: every field in one
 * ciphertext) and its three-way merge after two devices changed it offline (P-21): what only one
 * side changed is taken; where both changed the same thing, the server's value stays and the other
 * goes into the history, so nothing is lost.
 */
import { z } from "zod";

export const FieldKind = z.enum(["text", "secret", "url", "email", "totp", "note"]);
export const EntryType = z.enum([
  "login",
  "note",
  "wifi",
  "card",
  "ssh-key",
  "api-key",
  "identity",
]);

export const Field = z.object({
  id: z.string().min(1),
  name: z.string(),
  value: z.string(),
  kind: FieldKind,
});

export const HistoryItem = z.object({
  fieldId: z.string().min(1),
  value: z.string(),
  replacedAt: z.number().int().nonnegative(),
});

export const EntryContent = z.object({
  type: EntryType,
  title: z.string(),
  fields: z.array(Field),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  history: z.array(HistoryItem),
});

export type Field = z.infer<typeof Field>;
export type EntryContent = z.infer<typeof EntryContent>;

const sameField = (a: Field | undefined, b: Field | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.name === b.name &&
    a.value === b.value &&
    a.kind === b.kind);

/** One field: taken from the side that changed it; if both did, theirs stays and mine is lost to history */
const mergeField = (
  base: Field | undefined,
  mine: Field | undefined,
  theirs: Field | undefined,
) => {
  if (sameField(mine, theirs)) return { field: theirs, lost: undefined };
  if (sameField(base, mine)) return { field: theirs, lost: undefined };
  if (sameField(base, theirs)) return { field: mine, lost: undefined };
  const field = theirs ?? mine;
  return { field, lost: field === mine ? undefined : mine };
};

const byId = (fields: Field[]) => new Map(fields.map((field) => [field.id, field]));

const mergeScalar = <T>(base: T, mine: T, theirs: T): T =>
  mine === base ? theirs : mine === theirs ? theirs : base === theirs ? mine : theirs;

const mergeTags = (base: string[], mine: string[], theirs: string[]) => {
  const removed = new Set([...base].filter((tag) => !mine.includes(tag) || !theirs.includes(tag)));
  return [...new Set([...theirs, ...mine])].filter((tag) => !removed.has(tag)).sort();
};

const mergeHistory = (lists: EntryContent["history"][]) => {
  const seen = new Set<string>();
  return lists.flat().filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const mergeContent = (
  base: EntryContent,
  mine: EntryContent,
  theirs: EntryContent,
  now: number,
): EntryContent => {
  const [b, m, t] = [byId(base.fields), byId(mine.fields), byId(theirs.fields)];
  const ids = [...new Set([...theirs.fields, ...mine.fields].map((field) => field.id))];
  const lost: EntryContent["history"] = [];
  const fields = ids.flatMap((id) => {
    const { field, lost: gone } = mergeField(b.get(id), m.get(id), t.get(id));
    if (gone && gone.value !== "") lost.push({ fieldId: id, value: gone.value, replacedAt: now });
    return field ? [field] : [];
  });
  const title = mergeScalar(base.title, mine.title, theirs.title);
  if (title !== mine.title && mine.title !== base.title)
    lost.push({ fieldId: "title", value: mine.title, replacedAt: now });
  return {
    type: mergeScalar(base.type, mine.type, theirs.type),
    title,
    fields,
    tags: mergeTags(base.tags, mine.tags, theirs.tags),
    favorite: mergeScalar(base.favorite, mine.favorite, theirs.favorite),
    history: mergeHistory([theirs.history, mine.history, lost]),
  };
};
