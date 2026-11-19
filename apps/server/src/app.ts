/** The HTTP API (Hono): one place where every route is mounted and every request logged */
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "./db/database.ts";
import type { Log } from "./log.ts";

export type Deps = { db: Db; log: Log };

const databaseReachable = (db: Db) => {
  try {
    db.get(sql`select 1`);
    return true;
  } catch {
    return false;
  }
};

export const createApp = ({ db, log }: Deps) => {
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

  app.onError((error, c) => {
    log("error", "unhandled", { path: c.req.path, name: error.name });
    return c.json({ error: "internal" }, 500);
  });

  return app;
};
