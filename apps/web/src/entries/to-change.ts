/**
 * „Zum Ändern“ (K-306 part 5): entries whose password is weak or used in more than one entry this
 * account can see; and since K-307 entries whose secrets someone who left could read (their marks
 * travel encrypted in the entry, P-11). Worked out in memory on the device from the decrypted entries each time they
 * change; no value, hash or mark of it is stored or sent anywhere.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { isWeak } from "./password-check.ts";

/**
 * The fields checked: the types' passwords (login, Wi-Fi) and the SSH key's passphrase. A PIN, a
 * card's check number or an API key is short or fixed by design, so calling it weak would say
 * nothing; own secret fields may be any of these and are left out.
 */
const CHECKED = new Set(["password", "passphrase"]);

/** What the check reads of an entry: its fields, as shown or as stored (an import's preview) */
type WithFields = { fields: readonly { id: string; kind: string; value: string }[] };

export const checkedPasswords = (entry: WithFields): string[] =>
  entry.fields
    .filter((f) => f.kind === "secret" && CHECKED.has(f.id) && f.value !== "")
    .map((f) => f.value);

/** Whether one of the entry's checked passwords is weak (K-501 marks them in an import's preview) */
export const hasWeakPassword = (entry: WithFields) => checkedPasswords(entry).some(isWeak);

/** For every password, the entries it is used in */
const usersOf = (entries: readonly ShownEntry[]) => {
  const users = new Map<string, Set<string>>();
  for (const entry of entries)
    for (const value of checkedPasswords(entry))
      users.set(value, (users.get(value) ?? new Set()).add(entry.id));
  return users;
};

/**
 * The entries with `weak` and `reused` set: reused is how many entries share one of its
 * passwords, itself included, or 0 when no other entry does
 */
export const markToChange = (entries: readonly ShownEntry[]): ShownEntry[] => {
  const users = usersOf(entries);
  return entries.map((entry) => {
    const values = checkedPasswords(entry);
    const reused = Math.max(0, ...values.map((value) => users.get(value)?.size ?? 0));
    return { ...entry, weak: hasWeakPassword(entry), reused: reused > 1 ? reused : 0 };
  });
};

/**
 * Whether an entry belongs under „Zum Ändern“: weak, reused, or marked because someone who left
 * could read its secrets (K-307, P-11)
 */
export const toChange = (entry: ShownEntry) =>
  entry.weak || entry.reused > 1 || (entry.marks?.length ?? 0) > 0;
