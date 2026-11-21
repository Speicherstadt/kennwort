/**
 * What the save prompt offers for a submitted login (K-404): the entries for the page's exact host
 * (page/matches.ts, the rule of popup, menu and filling) compared with what the user submitted.
 *
 * - `same`: an entry for the host has this user name (or, without one, this password) and this
 *   password: nothing to offer;
 * - `changed`: an entry for the host has this user name with another password, or, on a
 *   change-password form without a user name, the current password the form asked for: offer to
 *   update it;
 * - `new`: anything else: offer to save a new login.
 *
 * User names compare without case and surrounding spaces, as sign-ins mostly treat them;
 * passwords compare exactly.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { forPage } from "../popup/view.ts";
import type { Capture } from "./messages.ts";

export type Offer = { kind: "same" } | { kind: "new" } | { kind: "changed"; entry: ShownEntry };

const userKey = (username: string) => username.trim().toLocaleLowerCase();

/** The one to update among several: the one with the current password, else one the user may edit */
const pick = (entries: readonly ShownEntry[], previous: string | undefined) =>
  entries.find((entry) => previous !== undefined && entry.password === previous) ??
  entries.find((entry) => entry.editable !== false) ??
  entries[0];

export const offerFor = (entries: readonly ShownEntry[], capture: Capture): Offer => {
  const onPage = forPage(entries, capture.host);
  const user = userKey(capture.username);
  const candidates =
    user === ""
      ? onPage.filter(
          (entry) => capture.previous !== undefined && entry.password === capture.previous,
        )
      : onPage.filter((entry) => userKey(entry.username) === user);
  const sameLogin = user === "" ? onPage : candidates;
  if (sameLogin.some((entry) => entry.password === capture.password)) return { kind: "same" };
  const entry = pick(candidates, capture.previous);
  return entry ? { kind: "changed", entry } : { kind: "new" };
};
