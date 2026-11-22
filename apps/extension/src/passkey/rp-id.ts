/**
 * Which rpId a page may use (K-406, WebAuthn Level 3 §5.1.3 step 8 and §5.1.4.1 step 7, after the
 * HTML standard's "is a registrable domain suffix of or is equal to"): the page's own host, or a
 * parent domain of it that is not a public suffix. `portal.weber-haustechnik.test` may claim
 * `weber-haustechnik.test`, but not `test`, `co.uk`, `github.io` or another site's domain. tldts reads
 * the host against the Public Suffix List with its private part, as browsers do. The page's origin
 * comes from the browser's frame tree, never from the page (passkey-broker.ts).
 */
import { parse as parseDomain } from "tldts";

/**
 * "unsupported": a page Kennwort leaves to the browser (not a secure context, an IP address);
 * "SecurityError": an rpId the page may not use, which the browser would refuse the same way
 */
export type RpIdRefusal = "unsupported" | "SecurityError";
export type RpIdResult =
  | { ok: true; value: { origin: string; rpId: string } }
  | { ok: false; error: RpIdRefusal };

/** A host tldts would swallow as a public suffix, but that names one machine */
const LOCAL_HOSTS = ["localhost"];
const DOMAIN_OPTIONS = {
  allowPrivateDomains: true,
  extractHostname: false,
  validHosts: LOCAL_HOSTS,
};

const parseUrl = (text: string) => {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
};

/** A secure context's origin and host: https, or http on localhost */
const securePage = (url: URL) => {
  const host = url.hostname.replace(/\.$/, "");
  if (url.protocol === "https:" || (url.protocol === "http:" && host === "localhost"))
    return host === "" ? undefined : { origin: url.origin, host };
  return undefined;
};

/** The claimed rpId as a host: lower case, punycode, nothing but a host; undefined otherwise */
const normalised = (claimed: string) => {
  const url = parseUrl(`https://${claimed}`);
  if (!url || url.host !== url.hostname) return undefined;
  return url.hostname === claimed.toLowerCase() || url.hostname === claimed
    ? url.hostname
    : undefined;
};

/** Whether rpId is the host or a registrable suffix of it */
export const rpIdAllowed = (host: string, rpId: string) => {
  if (rpId === host) return true;
  if (!host.endsWith(`.${rpId}`)) return false;
  // A parent domain only when it is at least the host's registrable domain (not a public suffix)
  const domain = parseDomain(rpId, DOMAIN_OPTIONS);
  return domain.domain !== null && !domain.isIp && domain.publicSuffix !== rpId;
};

/** The origin of the page and the rpId it may use: its own host when it claims none */
export const rpIdFor = (pageUrl: string, claimed: string | undefined): RpIdResult => {
  const url = parseUrl(pageUrl);
  const page = url && securePage(url);
  if (!page || parseDomain(page.host, DOMAIN_OPTIONS).isIp)
    return { ok: false, error: "unsupported" };
  const rpId = claimed === undefined ? page.host : normalised(claimed);
  if (rpId === undefined || !rpIdAllowed(page.host, rpId))
    return { ok: false, error: "SecurityError" };
  return { ok: true, value: { origin: page.origin, rpId } };
};
