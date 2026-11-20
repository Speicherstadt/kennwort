/**
 * Which entries belong to the page in the active tab (K-402): by exact host only, compared by the
 * extension itself, since tldts is not on the list of allowed packages yet. "portal.example.test"
 * matches an entry for "portal.example.test" and nothing else: no parent domain, no subdomain, no
 * look-alike. Scheme, port, path and case do not count, a trailing dot neither. The stricter rule for
 * filling in (Public Suffix List, scheme, frames) comes with K-403 (P-17); the popup only shows and
 * copies. The hosts come from the entry's encrypted content, never from the server (E-14).
 */
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";

const WEB = new Set(["http:", "https:"]);

/** The host of a web address, as the URL parser normalises it (lower case, punycode) */
const hostOf = (url: URL) => (WEB.has(url.protocol) ? url.hostname.replace(/\.$/, "") : undefined);

const parse = (text: string) => {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
};

/** The host of the page in the active tab; undefined for anything but an http(s) page */
export const pageHost = (url: string | undefined) => {
  const parsed = url ? parse(url) : undefined;
  const host = parsed && hostOf(parsed);
  return host || undefined;
};

// A scheme, unless what follows the colon is a port ("bank.test:443")
const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** A stored address may lack its scheme ("bank.test"): then it is read as https */
const storedHost = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = parse(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  return (parsed && hostOf(parsed)) || undefined;
};

/** The hosts of every web address in the entry (the login's website and own address fields) */
export const entryHosts = (entry: ShownEntry): string[] =>
  entry.fields.flatMap((field) => {
    const host = field.kind === "url" ? storedHost(field.value) : undefined;
    return host ? [host] : [];
  });

export const matchesHost = (entry: ShownEntry, host: string | undefined) =>
  host !== undefined && entryHosts(entry).includes(host);
