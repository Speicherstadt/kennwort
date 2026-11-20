/**
 * Devices (K-303, P-04: "Die Geräteliste zeigt jedes Gerät, abmelden widerruft dessen Sitzung").
 * A client sends a random device ID and a name it makes up from its browser at every request; a
 * sign-in then keeps one session per device and account, so the sessions are the device list. The
 * name is the device's own label, never checked; the server shows it back to the same account only.
 */
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import { authSession, deviceSessions } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { Auth } from "./better-auth.ts";

export const DEVICE_HEADER = "x-kennwort-device";
export const DEVICE_NAME_HEADER = "x-kennwort-device-name";

/** The device's ID (16 random bytes, base64url) and its name, when both are sent and well-formed */
export const deviceOf = (request: Request) => {
  const id = request.headers.get(DEVICE_HEADER);
  const name = decodeName(request.headers.get(DEVICE_NAME_HEADER));
  return id && /^[A-Za-z0-9_-]{22}$/.test(id) && name ? { id, name } : undefined;
};

// Headers carry Latin-1 only, so the client percent-encodes the name; control characters are refused
const decodeName = (raw: string | null) => {
  if (!raw) return undefined;
  try {
    const name = decodeURIComponent(raw).trim();
    return name.length > 0 && name.length <= 64 && !/\p{Cc}/u.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
};

/**
 * A new session for the account; from a device that says who it is, its earlier sessions of this
 * account end, so each device holds one
 */
export const startSession = async (db: Db, auth: Auth, accountId: string, request: Request) => {
  const session = await (await auth.$context).internalAdapter.createSession(accountId);
  const device = deviceOf(request);
  if (!session || !device) return session;
  db.transaction((tx) => {
    const earlier = tx
      .select({ id: deviceSessions.sessionId })
      .from(deviceSessions)
      .where(and(eq(deviceSessions.accountId, accountId), eq(deviceSessions.deviceId, device.id)))
      .all()
      .map((row) => row.id);
    if (earlier.length > 0)
      tx.delete(authSession)
        .where(
          and(
            eq(authSession.userId, accountId),
            inArray(authSession.id, earlier),
            ne(authSession.id, session.id),
          ),
        )
        .run();
    tx.insert(deviceSessions)
      .values({
        sessionId: session.id,
        accountId,
        deviceId: device.id,
        name: device.name,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      })
      .run();
  });
  return session;
};

/** The session was used: its device's last activity moves (review of K-303) */
export const touchDevice = (db: Db, sessionId: string | undefined, now: number) => {
  if (!sessionId) return;
  db.update(deviceSessions)
    .set({ lastSeenAt: now })
    .where(eq(deviceSessions.sessionId, sessionId))
    .run();
};

/** GET /api/devices and DELETE /api/devices/:id: only the session's own account's devices */
export const deviceRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>()
    .get("/devices", (c) => {
      const { accountId, sessionId } = c.var.session;
      const rows = db
        .select({
          id: authSession.id,
          name: deviceSessions.name,
          signedInAt: authSession.createdAt,
          lastSeenAt: deviceSessions.lastSeenAt,
          updatedAt: authSession.updatedAt,
        })
        .from(authSession)
        .leftJoin(deviceSessions, eq(deviceSessions.sessionId, authSession.id))
        .where(and(eq(authSession.userId, accountId), gt(authSession.expiresAt, new Date(now()))))
        .all();
      return c.json({
        devices: rows.map((row) => ({
          id: row.id,
          name: row.name,
          signedInAt: row.signedInAt.getTime(),
          // A session without a device (no header sent) has only Better Auth's daily update
          lastSeenAt: row.lastSeenAt ?? row.updatedAt.getTime(),
          current: row.id === sessionId,
        })),
      });
    })
    .delete("/devices/:id", (c) => {
      const removed = db
        .delete(authSession)
        .where(
          and(
            eq(authSession.id, c.req.param("id")),
            eq(authSession.userId, c.var.session.accountId),
          ),
        )
        .returning()
        .get();
      return removed ? c.json({ removed: true }) : c.json({ error: "not-found" }, 404);
    });
