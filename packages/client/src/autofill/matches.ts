/**
 * Which entries belong to a page, by exact host only (K-402, K-403, P-17): the popup lists by it,
 * the inline menu lists by it, and the service worker fills only by it. "portal.example.test"
 * matches an entry for "portal.example.test" and nothing else: no parent domain, no subdomain, no
 * look-alike. The URL parser normalises the host (lower case, punycode, no trailing dot); tldts
 * reads it against the Public Suffix List, so a public suffix itself ("co.uk", "github.io") is
 * never taken for one site. Scheme, port and path do not count for the match; filling also refuses
 * a password stored for https on a page served over http. The hosts come from the entry's
 * encrypted content, never from the server (E-14).
 */

import { parse as parseDomain } from "tldts";
import type { ShownEntry } from "../entries/entries.ts";

const WEB = new Set(["http:", "https:"]);
/** A host a public suffix rule would swallow but that names one machine (tldts, validHosts) */
const LOCAL_HOSTS = ["localhost"];

const parse = (text: string) => {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
};

/** The host as the URL parser normalised it, if it names one site and not a public suffix */
const siteHost = (url: URL) => {
  if (!WEB.has(url.protocol)) return undefined;
  const host = url.hostname.replace(/\.$/, "");
  const domain = parseDomain(host, {
    allowPrivateDomains: true,
    extractHostname: false,
    validHosts: LOCAL_HOSTS,
  });
  if (domain.hostname === null || host === "") return undefined;
  return domain.isIp || domain.domain !== null ? host : undefined;
};

/** The exact host of a page; undefined for anything but an http(s) page of one site */
export const pageHost = (url: string | undefined) => {
  const parsed = url ? parse(url) : undefined;
  return parsed && siteHost(parsed);
};

// A scheme, unless what follows the colon is a port ("bank.test:443")
const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Where a stored address points: its exact host, and whether it was stored for https */
export type StoredAddress = { host: string; secure: boolean };

/** A stored address may lack its scheme ("bank.test"): then it is read as https */
const storedAddress = (value: string): StoredAddress | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = parse(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  const host = parsed && siteHost(parsed);
  return parsed && host ? { host, secure: parsed.protocol === "https:" } : undefined;
};

/** The web addresses among stored values (an entry's URL fields) */
export const entryAddresses = (values: readonly string[]): StoredAddress[] =>
  values.flatMap((value) => {
    const address = storedAddress(value);
    return address ? [address] : [];
  });

/** The values of an entry's URL fields: the login's website and its own address fields */
export const urlValues = (entry: ShownEntry): string[] =>
  entry.fields.filter((field) => field.kind === "url").map((field) => field.value);

/** The hosts of every web address in the entry */
export const entryHosts = (entry: ShownEntry): string[] =>
  entryAddresses(urlValues(entry)).map((address) => address.host);

export const matchesHost = (entry: ShownEntry, host: string | undefined) =>
  host !== undefined && entryHosts(entry).includes(host);

/**
 * Whether a login with these stored addresses may be filled into the page at this address: the
 * exact host of one of them, and not a password stored for https into a page served over http
 */
export const fillAllowed = (pageUrl: string, addresses: readonly string[]) => {
  const host = pageHost(pageUrl);
  const secure = parse(pageUrl)?.protocol === "https:";
  return entryAddresses(addresses).some(
    (address) => address.host === host && (secure || !address.secure),
  );
};
