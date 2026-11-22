/**
 * What the phishing warning shows (K-405), decided in the prompt page from the decrypted entries the
 * service worker named by their tags: the first of them and the site its password belongs to. The
 * worker compared only tags; here the exact hosts are checked once more (page/matches.ts), so an
 * entry that is for this very host, or none left to name, closes the warning unseen. Entries that
 * could not load or were not trusted close it as well: it names nothing it could not check.
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { Load } from "../account/load-entries.ts";
import type { Warning } from "../alert/messages.ts";
import { entryAddresses, matchesHost, urlValues } from "../page/matches.ts";

export type AlertView =
  | { kind: "waiting" }
  | { kind: "close" }
  | { kind: "warn"; entry: ShownEntry; site: string; secure: boolean };

export type AlertInput = { load: Load; entries: readonly ShownEntry[]; warning: Warning };

export const alertView = (input: AlertInput): AlertView => {
  if (input.load === "loading") return { kind: "waiting" };
  if (input.load !== "ready") return { kind: "close" };
  const named = input.entries.filter((entry) => input.warning.entries.includes(entry.id));
  if (named.some((entry) => matchesHost(entry, input.warning.host))) return { kind: "close" };
  for (const entry of named) {
    const [address] = entryAddresses(urlValues(entry));
    if (address) return { kind: "warn", entry, site: address.host, secure: address.secure };
  }
  return { kind: "close" };
};

/** Where a site takes its users to change a password (W3C, A Well-Known URL for Changing Passwords) */
export const changePasswordUrl = (site: string, secure: boolean) =>
  `${secure ? "https" : "http"}://${site}/.well-known/change-password`;
