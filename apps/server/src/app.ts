/** The HTTP API (Hono): one place where every route is mounted and every request logged */
import { sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { memberRoutes } from "./account/members.ts";
import { policyRoutes } from "./account/policy.ts";
import { accountRoutes } from "./account/routes.ts";
import { auditRoutes } from "./audit/routes.ts";
import { type Auth, CLIENT_HEADER } from "./auth/better-auth.ts";
import type { ClientAddress, ClientEnv } from "./auth/client-address.ts";
import { deviceRoutes, touchDevice } from "./auth/devices.ts";
import { acceptInvitationRoute, createInvitationRoute } from "./auth/invitations.ts";
import { loginKeyRoutes } from "./auth/login-key.ts";
import { pairingApiRoutes, pairingPublicRoutes } from "./auth/pairings.ts";
import { setupRoute } from "./auth/setup.ts";
import type { Db } from "./db/database.ts";
import type { Log } from "./log.ts";
import { createHub, type Hub } from "./sync/hub.ts";
import { logRoutes } from "./sync/log-routes.ts";
import { syncRoutes } from "./sync/routes.ts";
import { companyRoutes, type TenantEnv } from "./tenancy/routes.ts";
import { companyScope } from "./tenancy/scope.ts";
import type { Authenticate } from "./tenancy/session.ts";

/** Sign-in: Better Auth, the sign-in key routes and invitations (K-203); absent in tests of other parts */
export type SignIn = {
  auth: Auth;
  secret: string;
  now: () => number;
  random: (length: number) => Uint8Array;
  allow: (key: string) => boolean;
  address: ClientAddress;
  setupCode?: string | undefined;
};

export type Deps = {
  db: Db;
  log: Log;
  authenticate: Authenticate;
  signIn?: SignIn;
  hub?: Hub;
  now?: () => number;
  keepAliveMs?: number;
};

const databaseReachable = (db: Db) => {
  try {
    db.get(sql`select 1`);
    return true;
  } catch {
    return false;
  }
};

export const createApp = ({
  db,
  log,
  authenticate,
  signIn,
  hub = createHub(),
  now = Date.now,
  keepAliveMs,
}: Deps) => {
  const app = new Hono();

  // Method, path without query string, status and duration; nothing of headers or body
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    log("info", "request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  app.get("/health", (c) => {
    const ok = databaseReachable(db);
    return c.json(
      { status: ok ? "ok" : "unavailable", database: ok ? "ok" : "unreachable" },
      ok ? 200 : 503,
    );
  });

  // Everything under /api needs a session; routes see only the session's company
  const api = new Hono<TenantEnv>();
  const requireSession: MiddlewareHandler<TenantEnv> = async (c, next) => {
    const session = await authenticate(c.req.raw);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    c.set("session", session);
    touchDevice(db, session.sessionId, now());
    c.set("scope", companyScope(db, session.companyId));
    await next();
  };
  api.use(requireSession);
  api.route("/", companyRoutes());
  api.route("/", auditRoutes({ now }));
  api.route("/", accountRoutes({ db, now }));
  api.route("/", memberRoutes({ db, now }));
  api.route("/", policyRoutes({ db, now }));
  api.route("/", deviceRoutes({ db, now }));
  api.route("/", logRoutes({ db, now }));
  api.route("/", syncRoutes({ hub, now, ...(keepAliveMs ? { keepAliveMs } : {}) }));
  if (signIn) {
    const deps = { db, ...signIn };
    api.route("/", createInvitationRoute(deps));
    api.route("/", pairingApiRoutes(deps));
    // Public: sign-in key, accepting an invitation, and Better Auth (passkeys, sessions) for the rest
    app.route("/auth/login-key", loginKeyRoutes(deps));
    app.route("/auth/pairings", pairingPublicRoutes(deps));
    app.route("/auth", acceptInvitationRoute(deps));
    app.route("/auth", setupRoute({ ...deps, setupCode: signIn.setupCode }));
    app.on(["GET", "POST"], "/auth/*", (c) => {
      // Better Auth's rate limit reads the client address from this header only; a value a
      // client sent itself is replaced (review of K-203)
      const request = new Request(c.req.raw);
      request.headers.set(CLIENT_HEADER, signIn.address(c.req.raw, c.env as ClientEnv));
      return signIn.auth.handler(request);
    });
  }
  app.route("/api", api);

  // Every answer is JSON, unknown routes too; clients and the stand-in (K-207) rely on it
  app.notFound((c) => c.json({ error: "not-found" }, 404));

  app.onError((error, c) => {
    log("error", "unhandled", { path: c.req.path, name: error.name });
    return c.json({ error: "internal" }, 500);
  });

  // The tenancy test tells the middleware from endpoints by this handler, not by method and path
  return Object.assign(app, { requireSession, hub });
};
