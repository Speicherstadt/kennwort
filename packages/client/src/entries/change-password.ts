/**
 * Where „Jetzt ändern“ takes someone (K-603): the page a site names for changing a password, by
 * the W3C's "A Well-Known URL for Changing Passwords" (`/.well-known/change-password` on the
 * site's origin); a site that does not know it redirects to its start page or answers 404, which
 * the person sees and can go on from. A device on an IP address or a name without a dot (a router,
 * a NAS) has no such page: there it is the device's own start page.
 *
 * Only http and https: any other scheme (`javascript:`, `data:`, `file:`, an app's) gives no link,
 * so a website field can never run code or open a local file. An address without a scheme counts
 * as https, as browsers do; the origin drops a path, query, fragment and any user and password.
 */
export type ChangeLink = { url: string; wellKnown: boolean };

/** A scheme in front: letters and then ":", unless what follows is a port ("router.test:8080") */
const SCHEME = /^([a-z][a-z\d+.-]*):(?!\d+(?:[/?#]|$))/i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const parse = (text: string) => {
  try {
    return new URL(SCHEME.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
};

/** A name with a dot that is no IP address: one that can have pages of its own */
const isNamedSite = (host: string) =>
  !host.startsWith("[") && !IPV4.test(host) && host.replace(/\.$/, "").includes(".");

export const changeLink = (website: string): ChangeLink | undefined => {
  const text = website.trim();
  if (text === "") return undefined;
  const url = parse(text);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || url.hostname === "")
    return undefined;
  return isNamedSite(url.hostname)
    ? { url: `${url.origin}/.well-known/change-password`, wellKnown: true }
    : { url: `${url.origin}/`, wellKnown: false };
};
