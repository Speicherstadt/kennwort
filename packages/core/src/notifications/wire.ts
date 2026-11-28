/**
 * Notifications between client and server (K-602, docs/sicherheitsdesign.md P-24). The server
 * writes them only from events it handles anyway and names only IDs: the kind, the subject (a
 * vault, an entry, an invitation, a link or an account) and who caused it. Names of vaults and
 * entries are encrypted and never reach it; the client finds them locally. A notification is a
 * hint from an untrusted server, never a proof: what it points to is checked where it is shown.
 */
import { z } from "zod";
import { bytes } from "../sync/bytes.ts";

/** Every kind, in the order the settings list them */
export const NOTIFICATION_KINDS = Object.freeze([
  "access-requested",
  "vault-added",
  "share-received",
  "invitation-accepted",
  "member-renewed",
  "root-changed",
  "emergency-requested",
  "emergency-answered",
  "emergency-granted",
  "account-recovered",
  "link-opened",
  "security-report",
  // OpenID Connect (K-604, P-25): to admins, someone enrolled
  "member-enrolled",
  // To owners and admins: a newer release of Kennwort is out (K-703)
  "update-available",
] as const);
export const NotificationKind = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** An ID as the server keeps it: base64url text, never a name */
const IdText = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const Notification = z.object({
  id: IdText,
  kind: NotificationKind,
  subject: IdText.nullable(),
  actor: IdText.nullable(),
  createdAt: z.number().int().nonnegative(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationList = z.object({
  notifications: z.array(Notification),
  unread: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof NotificationList>;

/** Which kinds go out as Web Push, per account; in the app every kind always shows */
export const NotificationPrefs = z.object({
  push: z.array(NotificationKind).transform((kinds) => [...new Set(kinds)]),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

/** Until a person chooses: every kind as push, on the devices that turned push on */
export const defaultNotificationPrefs = (): NotificationPrefs => ({
  push: [...NOTIFICATION_KINDS],
});

export const wantsPush = (prefs: NotificationPrefs, kind: NotificationKind) =>
  prefs.push.includes(kind);

/**
 * A device's push subscription: only the address of the push service. The push carries no
 * content (P-24), so the keys for encrypting one (RFC 8291) are neither sent nor kept.
 */
export const PushSubscriptionWire = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
});
export type PushSubscriptionWire = z.infer<typeof PushSubscriptionWire>;

/** The server's VAPID public key (RFC 8292): an uncompressed P-256 point, 65 bytes */
export const PushKey = z.object({ publicKey: bytes(65) });
