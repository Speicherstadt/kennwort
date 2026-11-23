/**
 * Deep links from other apps (K-604, docs/plan.md: Verweise von außen): an entry or a vault by its
 * ID, through an open standard and nothing else. The https addresses of the app are links already
 * (/vaults/<id>, /vaults/<id>/<entry>, /entries/<entry>); the installed web app also takes the
 * scheme web+kennwort: (manifest `protocol_handlers`, the browser hands it to /open?link=…), and the
 * mobile app will take kennwort: the same way. A link carries IDs only, never a secret: it opens
 * nothing by itself, the app shows the entry only after unlocking and only if this account can
 * read it. Anything else in a link is ignored.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SCHEMES = new Set(["web+kennwort:", "kennwort:"]);

/** The app's address for a deep link, or undefined for anything that is not one */
export const deepLinkPath = (link: string): string | undefined => {
  const url = URL.parse(link);
  if (!url || !SCHEMES.has(url.protocol)) return undefined;
  // web+kennwort://vault/<id>/entry/<id> parses with "vault" as the host; web+kennwort:vault/… not
  const parts = `${url.host}${url.pathname}`.split("/").filter(Boolean);
  if (!parts.every((part) => ID.test(part))) return undefined;
  const [kind, id, sub, entry, ...rest] = parts;
  if (rest.length > 0 || !id) return undefined;
  if (kind === "entry" && sub === undefined) return `/entries/${id}`;
  if (kind !== "vault") return undefined;
  if (sub === undefined) return `/vaults/${id}`;
  return sub === "entry" && entry ? `/vaults/${id}/${entry}` : undefined;
};

/** Where /open?link=… leads: the linked page, else all entries */
export const openTarget = (search: string) =>
  deepLinkPath(new URLSearchParams(search).get("link") ?? "") ?? "/entries";
