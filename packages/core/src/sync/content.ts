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

// Two fields are the same when name, value and kind are; an absent field is only like another absent one
const fieldKey = (field: Field | undefined) =>
  field && JSON.stringify([field.name, field.value, field.kind]);
const sameField = (a: Field | undefined, b: Field | undefined) => fieldKey(a) === fieldKey(b);

/** One field: taken from the side that changed it; if both did, theirs stays and mine is lost */
const mergeField = (
  base: Field | undefined,
  mine: Field | undefined,
  theirs: Field | undefined,
): { field: Field | undefined; lost?: undefined } | { field: Field; lost: Field | undefined } => {
  if (sameField(mine, theirs) || sameField(base, mine)) return { field: theirs };
  if (sameField(base, theirs)) return { field: mine };
  // An edit beats a deletion on the other side
  if (!theirs) return { field: mine };
  // Mine deleted, theirs edited: lost is then undefined and theirs simply stays
  return { field: theirs, lost: mine };
};

const byId = (fields: Field[]) => new Map(fields.map((field) => [field.id, field]));

// The side that changed wins; if both did, theirs (already on the server) stays
const mergeScalar = <T>(base: T, mine: T, theirs: T): T => (base === theirs ? mine : theirs);

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

/** The losing side's value of a scalar both changed, for the history */
const lostScalar = (fieldId: string, base: string, mine: string, merged: string, now: number) =>
  mine !== base && mine !== merged ? [{ fieldId, value: mine, replacedAt: now }] : [];

/**
 * Where both changed a field: a lost value goes into the history; a lost name or kind stays as a
 * field of its own beside theirs (`id~time`), since the history keeps values only.
 */
const keepLost = (id: string, field: Field, gone: Field, now: number) => {
  const reshaped = gone.name !== field.name || gone.kind !== field.kind;
  if (reshaped) return { extra: [{ ...gone, id: `${id}~${now}` }], history: [] };
  return {
    extra: [],
    history: gone.value === "" ? [] : [{ fieldId: id, value: gone.value, replacedAt: now }],
  };
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
    const merged = mergeField(b.get(id), m.get(id), t.get(id));
    if (!merged.lost) return merged.field ? [merged.field] : [];
    const kept = keepLost(id, merged.field, merged.lost, now);
    lost.push(...kept.history);
    return [merged.field, ...kept.extra];
  });
  const title = mergeScalar(base.title, mine.title, theirs.title);
  const type = mergeScalar(base.type, mine.type, theirs.type);
  lost.push(...lostScalar("title", base.title, mine.title, title, now));
  lost.push(...lostScalar("type", base.type, mine.type, type, now));
  return {
    type,
    title,
    fields,
    tags: mergeTags(base.tags, mine.tags, theirs.tags),
    favorite: mergeScalar(base.favorite, mine.favorite, theirs.favorite),
    history: mergeHistory([theirs.history, mine.history, lost]),
  };
};
