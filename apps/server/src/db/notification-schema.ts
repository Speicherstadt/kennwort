// Notifications (K-602, docs/sicherheitsdesign.md P-24): rows per account written from events the
// server handles anyway, which kinds go out as push, the devices' push addresses and the VAPID key.
// IDs only: a vault's or an entry's name never reaches the server, the client finds it locally.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts, companies } from "./schema.ts";

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    kind: text("kind").notNull(),
    /** What it is about, by ID: a vault, an entry, an invitation, a link or an account */
    subject: text("subject"),
    /** Who caused it, by account ID */
    actor: text("actor"),
    createdAt: integer("created_at").notNull(),
    readAt: integer("read_at"),
  },
  (table) => [index("notifications_account").on(table.accountId, table.createdAt)],
);

/** Which kinds go out as push, as JSON (NotificationPrefs); without a row the defaults hold */
export const notificationPrefs = sqliteTable("notification_prefs", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  prefs: text("prefs").notNull(),
});

/**
 * A device's push subscription (RFC 8030): the push service's address only. The push carries no
 * content, so the keys to encrypt one (RFC 8291) are not kept. One row per address; the session
 * that stored it goes with it, so signing a device out ends its pushes.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    sessionId: text("session_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("push_subscriptions_account").on(table.accountId)],
);

/** Keys the server makes for itself on its first need, such as the VAPID key pair (RFC 8292) */
export const serverKeys = sqliteTable("server_keys", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  createdAt: integer("created_at").notNull(),
});
