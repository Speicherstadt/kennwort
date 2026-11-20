/** The HTTP API (Hono): one place where every route is mounted and every request logged */
import { sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import type { Db } from "./db/database.ts";
import type { Log } from "./log.ts";
import { companyRoutes, type TenantEnv } from "./tenancy/routes.ts";
import { companyScope } from "./tenancy/scope.ts";
import type { Authenticate } from "./tenancy/session.ts";

export type Deps = { db: Db; log: Log; authenticate: Authenticate };

const databaseReachable = (db: Db) => {
  try {
    db.get(sql`select 1`);
    return true;
  } catch {
    return false;
  }
};

export const createApp = ({ db, log, authenticate }: Deps) => {
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
    c.set("scope", companyScope(db, session.companyId));
    await next();
  };
  api.use(requireSession);
  api.route("/", companyRoutes());
  app.route("/api", api);

  app.onError((error, c) => {
    log("error", "unhandled", { path: c.req.path, name: error.name });
    return c.json({ error: "internal" }, 500);
  });

  // The tenancy test tells the middleware from endpoints by this handler, not by method and path
  return Object.assign(app, { requireSession });
};
