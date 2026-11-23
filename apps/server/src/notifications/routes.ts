/**
 * Notifications under /api (K-602, P-24): the account's own list, marking read, deleting, which
 * kinds go out as push, a live channel (SSE) that only says "something new", and the device's push
 * subscription. Each route reads and writes only rows of the session's account; a row of anyone
 * else answers like one that does not exist.
 */
import { encodeBytes, NotificationPrefs, PushSubscriptionWire } from "@kennwort/core";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Db } from "../db/database.ts";
import { notificationPrefs, notifications, pushSubscriptions } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { NotificationHub } from "./notify.ts";
import { prefsOf } from "./notify.ts";
import type { PushDeps } from "./push.ts";

/** What the list shows at most; older rows stay until pruned (MAX_NOTIFICATIONS) */
export const LISTED = 100;
/** Devices with push per account: a bound on the fan-out of one event */
export const MAX_SUBSCRIPTIONS = 20;

export type NotificationRouteDeps = {
  db: Db;
  now: () => number;
  hub: NotificationHub;
  push?: PushDeps | undefined;
  keepAliveMs?: number;
};

const notFound = { error: "not-found" } as const;

const own = (accountId: string, id?: string) =>
  id === undefined
    ? eq(notifications.accountId, accountId)
    : and(eq(notifications.accountId, accountId), eq(notifications.id, id));

const listOf = (db: Db, accountId: string) => {
  const rows = db
    .select()
    .from(notifications)
    .where(own(accountId))
    .orderBy(desc(notifications.createdAt))
    .limit(LISTED)
    .all();
  const unread =
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(own(accountId), isNull(notifications.readAt)))
      .get()?.value ?? 0;
  return {
    notifications: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      actor: row.actor,
      createdAt: row.createdAt,
      read: row.readAt !== null,
    })),
    unread,
  };
};

const listRoutes = ({ db, now }: NotificationRouteDeps) =>
  new Hono<TenantEnv>()
    .get("/notifications", (c) => c.json(listOf(db, c.var.session.accountId)))
    .post("/notifications/read", (c) => {
      db.update(notifications)
        .set({ readAt: now() })
        .where(and(own(c.var.session.accountId), isNull(notifications.readAt)))
        .run();
      return c.json({ ok: true });
    })
    .post("/notifications/:id/read", (c) => {
      const row = own(c.var.session.accountId, c.req.param("id"));
      if (!db.select().from(notifications).where(row).get()) return c.json(notFound, 404);
      // Read once: marking it again keeps the first time
      db.update(notifications)
        .set({ readAt: now() })
        .where(and(row, isNull(notifications.readAt)))
        .run();
      return c.json({ ok: true });
    })
    .delete("/notifications/:id", (c) => {
      const gone = db
        .delete(notifications)
        .where(own(c.var.session.accountId, c.req.param("id")))
        .returning()
        .get();
      return gone ? c.json({ ok: true }) : c.json(notFound, 404);
    })
    .get("/notifications/preferences", (c) => c.json(prefsOf(db, c.var.session.accountId)))
    .put("/notifications/preferences", async (c) => {
      const parsed = NotificationPrefs.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const prefs = JSON.stringify(parsed.data);
      db.insert(notificationPrefs)
        .values({ accountId: c.var.session.accountId, prefs })
        .onConflictDoUpdate({ target: notificationPrefs.accountId, set: { prefs } })
        .run();
      return c.json(parsed.data);
    });

/** "ready" once listening, then "notification" with no data for each new row, and pings */
const liveRoute = ({ hub, keepAliveMs = 20_000 }: NotificationRouteDeps) =>
  new Hono<TenantEnv>().get("/notifications/events", (c) =>
    streamSSE(c, async (stream) => {
      // An account that left the company hears nothing more (as the vault stream, review of K-307)
      const stillIn = () => {
        const stayed = c.var.scope.account(c.var.session.accountId)?.leftAt == null;
        if (!stayed) stream.abort();
        return stayed;
      };
      const unsubscribe = hub.subscribe(c.var.session.accountId, () => {
        if (stillIn()) void stream.writeSSE({ event: "notification", data: "" });
      });
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "" });
      while (!stream.aborted) {
        await stream.sleep(keepAliveMs);
        if (!stream.aborted && stillIn()) await stream.writeSSE({ event: "ping", data: "" });
      }
    }),
  );

const subscriptionCount = (db: Db, accountId: string) =>
  db
    .select({ value: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, accountId))
    .get()?.value ?? 0;

/** The device's push subscription; 404 for the key and the subscription where push is not set up */
const pushRoutes = ({ db, now, push }: NotificationRouteDeps) =>
  new Hono<TenantEnv>()
    .get("/push/key", async (c) =>
      push
        ? c.json({ publicKey: encodeBytes((await push.vapid()).publicKey) })
        : c.json(notFound, 404),
    )
    .put("/push/subscription", async (c) => {
      if (!push) return c.json(notFound, 404);
      const parsed = PushSubscriptionWire.safeParse(await c.req.json().catch(() => undefined));
      const sessionId = c.var.session.sessionId;
      if (!parsed.success || !push.allowHost(parsed.data.endpoint) || !sessionId)
        return c.json({ error: "invalid" }, 400);
      const { endpoint } = parsed.data;
      const accountId = c.var.session.accountId;
      const mine = db
        .select()
        .from(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.accountId, accountId)),
        )
        .get();
      if (!mine && subscriptionCount(db, accountId) >= MAX_SUBSCRIPTIONS)
        return c.json({ error: "too-many" }, 409);
      // The same browser signed in to another account takes its address along: one account per device
      db.insert(pushSubscriptions)
        .values({ endpoint, accountId, sessionId, createdAt: now() })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { accountId, sessionId } })
        .run();
      return c.json({ ok: true });
    })
    .delete("/push/subscription", async (c) => {
      const parsed = PushSubscriptionWire.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      db.delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, parsed.data.endpoint),
            eq(pushSubscriptions.accountId, c.var.session.accountId),
          ),
        )
        .run();
      return c.json({ ok: true });
    });

export const notificationRoutes = (deps: NotificationRouteDeps) =>
  new Hono<TenantEnv>()
    .route("/", listRoutes(deps))
    .route("/", liveRoute(deps))
    .route("/", pushRoutes(deps));
