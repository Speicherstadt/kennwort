/**
 * Writes notifications (K-602, P-24) from events the server handles anyway: one row per
 * recipient, IDs only, then a tickle on the account's live channel and, where the account wants
 * this kind as push, an empty push to its devices. Recipients outside the event's company, who
 * left, or who caused the event themselves get nothing. Each account keeps its newest rows only.
 */
import {
  defaultNotificationPrefs,
  encodeBytes,
  type NotificationKind,
  NotificationPrefs,
  wantsPush,
} from "@kennwort/core";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { accounts, notificationPrefs, notifications } from "../db/schema.ts";
import type { createHub } from "../sync/hub.ts";

/** Enough for months of a busy team; older ones go when a new one comes */
export const MAX_NOTIFICATIONS = 200;

export type NotifyEvent = {
  companyId: string;
  recipients: readonly string[];
  kind: NotificationKind;
  subject?: string | null;
  actor?: string | null;
};
export type Notify = (event: NotifyEvent) => void;
/** The live channel per account: an event says only that there is something new */
export type NotificationHub = ReturnType<typeof createHub<null>>;

export const prefsOf = (db: Db, accountId: string): NotificationPrefs => {
  const row = db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.accountId, accountId))
    .get();
  const parsed = row ? NotificationPrefs.safeParse(JSON.parse(row.prefs)) : undefined;
  return parsed?.success ? parsed.data : defaultNotificationPrefs();
};

/** The recipients who are current accounts of the company, each once, never the actor */
const currentRecipients = (db: Db, event: NotifyEvent) => {
  const wanted = [...new Set(event.recipients)].filter((id) => id !== event.actor);
  if (wanted.length === 0) return [];
  return db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.companyId, event.companyId),
        inArray(accounts.id, wanted),
        isNull(accounts.leftAt),
      ),
    )
    .all()
    .map((row) => row.id);
};

/** Drops all but the newest MAX_NOTIFICATIONS rows of the account */
const prune = (db: Db, accountId: string) => {
  const oldestKept = db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(eq(notifications.accountId, accountId))
    .orderBy(desc(notifications.createdAt))
    .limit(1)
    .offset(MAX_NOTIFICATIONS - 1)
    .get();
  if (oldestKept)
    db.delete(notifications)
      .where(
        and(
          eq(notifications.accountId, accountId),
          lt(notifications.createdAt, oldestKept.createdAt),
        ),
      )
      .run();
};

export type NotifierDeps = {
  db: Db;
  now: () => number;
  random?: (length: number) => Uint8Array;
  hub: NotificationHub;
  /** Pushes to the account's devices; absent where push is not set up */
  push?: ((accountId: string) => Promise<void>) | undefined;
};

export const createNotifier = (deps: NotifierDeps): Notify => {
  const random = deps.random ?? ((length) => crypto.getRandomValues(new Uint8Array(length)));
  return (event) => {
    const recipients = currentRecipients(deps.db, event);
    const at = deps.now();
    for (const accountId of recipients) {
      deps.db
        .insert(notifications)
        .values({
          id: encodeBytes(random(16)),
          companyId: event.companyId,
          accountId,
          kind: event.kind,
          subject: event.subject ?? null,
          actor: event.actor ?? null,
          createdAt: at,
        })
        .run();
      prune(deps.db, accountId);
      deps.hub.publish(accountId, null);
      if (deps.push && wantsPush(prefsOf(deps.db, accountId), event.kind))
        void deps.push(accountId).catch(() => undefined);
    }
  };
};

/** For routes built without notifications, such as in tests of other parts */
export const noNotify: Notify = () => {};
