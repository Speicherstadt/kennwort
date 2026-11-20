/**
 * „Zum Ändern“ (K-306 part 5): entries whose password is weak or used in more than one entry this
 * account can see. Worked out in memory on the device from the decrypted entries each time they
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

export const checkedPasswords = (entry: ShownEntry): string[] =>
  entry.fields
    .filter((f) => f.kind === "secret" && CHECKED.has(f.id) && f.value !== "")
    .map((f) => f.value);

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
    return { ...entry, weak: values.some(isWeak), reused: reused > 1 ? reused : 0 };
  });
};

/** Whether an entry belongs under „Zum Ändern“ */
export const toChange = (entry: ShownEntry) => entry.weak || entry.reused > 1;
