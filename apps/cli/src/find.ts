/**
 * Finding entries and fields for `search` and `get` (K-606), on the entries as the client shows
 * them (packages/client, entries.ts). The search looks only at titles, usernames and addresses:
 * a terminal keeps what it printed in its scrollback, and the query lands in the shell's history,
 * so neither secrets nor notes take part, not even the notes the app's own search reads. `get`
 * takes an entry only by its ID or its whole title and never guesses from a part.
 */
import type { ShownEntry, ShownField } from "@kennwort/client/entries/entries.ts";
import { folded } from "@kennwort/client/search.ts";
import { totpCode } from "@kennwort/core";

/** What the search compares the query with: title, username and every address */
const searched = (entry: ShownEntry) => [
  entry.title,
  entry.username,
  ...entry.fields.filter((f) => f.kind === "url").map((f) => f.value),
];

const byTitle = (a: ShownEntry, b: ShownEntry) => a.title.localeCompare(b.title);

export const searchEntries = (entries: readonly ShownEntry[], query: string) => {
  const needle = folded(query.trim());
  return entries
    .filter((entry) => searched(entry).some((text) => folded(text).includes(needle)))
    .sort(byTitle);
};

export type Found =
  | { ok: true; value: ShownEntry }
  | { ok: false; error: "not-found" }
  | { ok: false; error: "ambiguous"; candidates: ShownEntry[] };

/** The entry with this ID, else the one whose whole title it is; two such are named, not picked */
export const findEntry = (entries: readonly ShownEntry[], ref: string): Found => {
  const byId = entries.find((entry) => entry.id === ref);
  if (byId) return { ok: true, value: byId };
  const wanted = folded(ref.trim());
  const named = entries.filter((entry) => folded(entry.title) === wanted);
  const [only] = named;
  if (named.length === 1 && only) return { ok: true, value: only };
  return named.length === 0
    ? { ok: false, error: "not-found" }
    : { ok: false, error: "ambiguous", candidates: named };
};

export type Picked =
  | { ok: true; value: ShownField }
  | { ok: false; error: "no-field"; fields: string[] };

/**
 * The field named by its ID or label; without a name the password, else the first secret field.
 * The error names the fields there are by their IDs, never a value.
 */
export const pickField = (entry: ShownEntry, ref: string | undefined): Picked => {
  const wanted = ref === undefined ? undefined : folded(ref.trim());
  const field =
    wanted === undefined
      ? (entry.fields.find((f) => f.id === "password") ??
        entry.fields.find((f) => f.kind === "secret"))
      : (entry.fields.find((f) => f.id === ref) ??
        entry.fields.find((f) => folded(f.label) === wanted));
  return field
    ? { ok: true, value: field }
    : { ok: false, error: "no-field", fields: entry.fields.map((f) => f.id) };
};

/** The field's value to print; for a TOTP field the code of now, never the key */
export const readField = (
  field: ShownField,
  nowMs: number,
): { ok: true; value: string } | { ok: false; error: "empty-field" | "invalid-totp" } => {
  if (field.value === "") return { ok: false, error: "empty-field" };
  if (field.kind !== "totp") return { ok: true, value: field.value };
  const code = totpCode(field.value, nowMs);
  return code.ok ? { ok: true, value: code.value.code } : { ok: false, error: "invalid-totp" };
};
