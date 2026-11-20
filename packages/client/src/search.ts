/**
 * The search over all entries (K-306 part 5): title, type, tags and the value of every field that
 * is not secret, without regard to case or accents, so "buro" finds "Büro". Secret values and TOTP
 * keys are never searched: typing a password must not show which entry holds it.
 */
import type { ShownEntry } from "./entries/entries.ts";
import { typeLabel } from "./entries/entry-types.ts";

/** Only these kinds are searched; a kind this app does not know (another app's) is not */
const SEARCHED = new Set(["text", "url", "email", "note"]);

/** Lowercase without accents, ß as ss: what two texts are compared in */
export const folded = (text: string) =>
  // i18n-ignore: a letter to fold, not a text of the interface
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replaceAll("ß", "ss");

/** Everything of an entry the search looks at */
export const searchedTexts = (entry: ShownEntry): string[] => [
  entry.title,
  typeLabel(entry.type),
  ...entry.tags,
  ...entry.fields.filter((f) => SEARCHED.has(f.kind)).map((f) => f.value),
];

export const matchesSearch = (entry: ShownEntry, search: string) => {
  const needle = folded(search.trim());
  return needle === "" || searchedTexts(entry).some((text) => folded(text).includes(needle));
};
