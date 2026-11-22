/**
 * One-time links between client and server (K-601, P-18). The server keeps the F-15 ciphertext,
 * an expiry and how many fetches are left; it never sees the link secret, which stays in the
 * fragment. The limits are the server's to enforce; the client keeps to them when it asks.
 */
import { z } from "zod";
import { bytes } from "../sync/bytes.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const LINK_LIMITS = Object.freeze({
  /** A link lasts at most seven days, as Bitwarden Send's default deletion date */
  maxExpiryMs: 7 * DAY,
  minExpiryMs: 5 * 60 * 1000,
  minFetches: 1,
  maxFetches: 10,
  /** The ciphertext: well above a login with notes, small enough for one database row */
  maxBytes: 64 * 1024,
});

/** The expiries the app offers; the server takes any between the limits */
export const LINK_EXPIRIES = Object.freeze([HOUR, DAY, 3 * DAY, 7 * DAY]);

/** 16 random bytes in base64url without padding, the form of a link's public and fetch IDs */
export const LinkIdText = z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/);

export const LinkCreate = z.object({
  ciphertext: bytes().refine(
    (value) => value.length > 0 && value.length <= LINK_LIMITS.maxBytes,
    "size", // i18n-ignore: for developers
  ),
  expiresInMs: z.number().int().min(LINK_LIMITS.minExpiryMs).max(LINK_LIMITS.maxExpiryMs),
  maxFetches: z.number().int().min(LINK_LIMITS.minFetches).max(LINK_LIMITS.maxFetches),
});
export type LinkCreate = z.infer<typeof LinkCreate>;

/**
 * The answer to a new link: `id` names it for its creator (list, revoke, audit log), `fetchId`
 * goes into the address; the server keeps only a hash of the latter
 */
export const LinkCreated = z.object({
  id: LinkIdText,
  fetchId: LinkIdText,
  expiresAt: z.number().int().nonnegative(),
});
export type LinkCreated = z.infer<typeof LinkCreated>;

export const LinkSummary = z.object({
  id: LinkIdText,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  maxFetches: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type LinkSummary = z.infer<typeof LinkSummary>;
export const LinkList = z.object({ links: z.array(LinkSummary) });

/** What a fetch returns: the ciphertext, and how many fetches are left after this one */
export const LinkFetched = z.object({
  ciphertext: bytes(),
  remaining: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type LinkFetched = z.infer<typeof LinkFetched>;
