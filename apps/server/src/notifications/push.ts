/**
 * Web Push without content (RFC 8030, VAPID by RFC 8292): the server sends each device an empty
 * push, a "tickle"; the service worker shows a fixed text and the app fetches the notifications
 * over its own session. A push service (Google, Mozilla, Apple, Microsoft) so learns only that
 * Kennwort sends something to a device and when, never what. No body means no RFC 8291
 * encryption and no package for it. A push service that answers 404 or 410 has dropped the
 * subscription, and so does the server.
 */
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { authSession, pushSubscriptions } from "../db/schema.ts";
import type { Log } from "../log.ts";
import { type Vapid, vapidAuthorization } from "./vapid.ts";

/**
 * The push services of the browsers people use, by host suffix: the server posts only to these, so
 * an address a client sends cannot make it call into the server's own network (SSRF). Others come
 * from KENNWORT_PUSH_HOSTS.
 */
export const PUSH_HOSTS = Object.freeze([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
]);

export const pushHostAllowed =
  (hosts: readonly string[] = PUSH_HOSTS) =>
  (endpoint: string) => {
    const url = URL.parse(endpoint);
    if (url?.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
    return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  };

/** A day: a device that is off longer gets no stale tickle, the app shows the list anyway */
const TTL_SECONDS = 24 * 60 * 60;

export type PushSend = "sent" | "gone" | "failed";

export type PushDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  vapid: () => Promise<Vapid>;
  /** Who sends, for the push services (RFC 8292 `sub`): the public address or a mailto: */
  subject: string;
  allowHost: (endpoint: string) => boolean;
};

/**
 * One empty push. `Topic` lets the push service keep only the newest of several waiting for an
 * offline device; the same fixed word for every push says nothing about what happened.
 */
export const sendTickle = async (deps: PushDeps, endpoint: string, now: number) => {
  try {
    const response = await deps.fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidAuthorization(await deps.vapid(), endpoint, deps.subject, now),
        ttl: String(TTL_SECONDS),
        urgency: "normal",
        topic: "kennwort",
        "content-length": "0",
      },
      redirect: "error",
    });
    if (response.status === 404 || response.status === 410) return "gone";
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
};

/**
 * Pushes to every device of the account whose session still lasts; a subscription of a session
 * that ended (signed out, replaced, the account left) and one the push service dropped go. The
 * log names neither the address, which is a secret of the device, nor the account.
 */
export const createPusher =
  (db: Db, deps: PushDeps, log: Log, now: () => number) => async (accountId: string) => {
    const rows = db
      .select({ endpoint: pushSubscriptions.endpoint, session: authSession.id })
      .from(pushSubscriptions)
      .leftJoin(
        authSession,
        and(
          eq(authSession.id, pushSubscriptions.sessionId),
          gt(authSession.expiresAt, new Date(now())),
        ),
      )
      .where(eq(pushSubscriptions.accountId, accountId))
      .all();
    const drop = (endpoint: string) =>
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
    await Promise.all(
      rows.map(async ({ endpoint, session }) => {
        if (!session || !deps.allowHost(endpoint)) return drop(endpoint);
        const sent = await sendTickle(deps, endpoint, now());
        if (sent === "gone") drop(endpoint);
        if (sent === "failed") log("warn", "push failed", {});
      }),
    );
  };
