/**
 * Change marks of P-11 (docs/sicherheitsdesign.md): when someone leaves a vault, every secret they
 * could read is marked "to change", because they may have copied it; a new vault key protects only
 * what is written after it. Bitwarden's and 1Password's offboarding guidance says the same: change
 * the passwords the person could see. A mark names the person, the time and the secret fields;
 * each field leaves the mark once its value changes, and the mark goes with its last field.
 *
 * Marks live in the entry's content (P-09): encrypted, signed with every version, seen by every
 * member, and the server cannot drop one unnoticed.
 */
import { z } from "zod";
import type { EntryContent, Field } from "./content.ts";

export const ChangeMark = z.object({
  /** The account that left, base64url */
  account: z.string().min(1),
  /** When the vault key changed for it, Unix seconds */
  at: z.number().int().nonnegative(),
  /** The secret fields it could read */
  fields: z.array(z.string().min(1)).min(1),
});
export type ChangeMark = z.infer<typeof ChangeMark>;

const SECRET_KINDS: ReadonlySet<Field["kind"]> = new Set(["secret", "totp"]);

/** The fields with a secret worth changing: passwords, PINs and one-time code keys with a value */
export const secretFieldIds = (content: EntryContent) =>
  content.fields.filter((f) => SECRET_KINDS.has(f.kind) && f.value !== "").map((f) => f.id);

const NO_MARKS: readonly ChangeMark[] = [];

/** The marks of an entry; none when the content has no list */
export const marksOf = (content: EntryContent): readonly ChangeMark[] =>
  content.toChange ?? NO_MARKS;

/** The content with these marks; without any, no key at all, so unmarked content stays as it was */
export const withMarks = (content: EntryContent, marks: readonly ChangeMark[]): EntryContent => {
  const { toChange: _, ...rest } = content;
  return marks.length > 0 ? { ...rest, toChange: [...marks] } : rest;
};

/** Marks every secret of the entry for the account that left; its own mark grows, keeping its time */
export const markForChange = (content: EntryContent, account: string, at: number): EntryContent => {
  const fields = secretFieldIds(content);
  if (fields.length === 0) return content;
  const marks = marksOf(content);
  const own = marks.find((mark) => mark.account === account);
  return withMarks(
    content,
    own
      ? marks.map((m) => (m === own ? { ...m, fields: [...new Set([...m.fields, ...fields])] } : m))
      : [...marks, { account, at, fields }],
  );
};

const valueIn = (fields: readonly Field[], id: string) => fields.find((f) => f.id === id)?.value;

/** The marks that still hold after a change: a field whose value changed or vanished leaves them */
export const settleMarks = (
  marks: readonly ChangeMark[],
  before: EntryContent,
  after: EntryContent,
): ChangeMark[] =>
  marks.flatMap((mark) => {
    const fields = mark.fields.filter((id) => {
      const value = valueIn(after.fields, id);
      return value !== undefined && value === valueIn(before.fields, id);
    });
    return fields.length > 0 ? [{ ...mark, fields }] : [];
  });

/**
 * The marks after a three-way merge: a mark of the base stays with the fields both sides kept; a new
 * one with the fields either side marked. A field stays marked only if its merged value is the one
 * a side marked: a secret the other side changed meanwhile was never read by the person.
 */
export const mergeMarks = (
  base: EntryContent,
  mine: EntryContent,
  theirs: EntryContent,
  merged: readonly Field[],
): ChangeMark[] => {
  const markIn = (content: EntryContent, account: string) =>
    marksOf(content).find((mark) => mark.account === account);
  const accounts = new Set([...marksOf(theirs), ...marksOf(mine)].map((m) => m.account));
  return [...accounts].flatMap((account) => {
    const sides = [mine, theirs].flatMap((content) => {
      const mark = markIn(content, account);
      return mark ? [{ content, mark }] : [];
    });
    const kept = markIn(base, account);
    const candidates = kept
      ? kept.fields.filter(
          (id) => sides.length === 2 && sides.every((s) => s.mark.fields.includes(id)),
        )
      : [...new Set(sides.flatMap((s) => s.mark.fields))];
    const fields = candidates.filter((id) => {
      const value = valueIn(merged, id);
      return (
        value !== undefined &&
        sides.some((s) => s.mark.fields.includes(id) && valueIn(s.content.fields, id) === value)
      );
    });
    const at = Math.min(...sides.map((s) => s.mark.at));
    return fields.length > 0 ? [{ account, at, fields }] : [];
  });
};
