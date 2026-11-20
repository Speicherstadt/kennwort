/**
 * Brakes on guessing (docs/plan.md, Bedrohungsmodell: "Anmeldung durchprobieren"): a rate limit per
 * client address in memory, and a lockout per account after failed sign-ins, kept in the database.
 */
import { and, count, eq, gt } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { loginFailures } from "../db/schema.ts";

export const LOCKOUT = { failures: 5, windowMs: 15 * 60 * 1000 };

/** At most `max` calls per key in `windowMs`; returns whether this call may go on */
export const rateLimiter = (max: number, windowMs: number, now: () => number = Date.now) => {
  const calls = new Map<string, number[]>();
  return (key: string) => {
    const since = now() - windowMs;
    const recent = (calls.get(key) ?? []).filter((at) => at > since);
    const allowed = recent.length < max;
    if (allowed) recent.push(now());
    calls.set(key, recent);
    return allowed;
  };
};

export const recentFailures = (db: Db, accountId: string, now: number) =>
  db
    .select({ n: count() })
    .from(loginFailures)
    .where(
      and(eq(loginFailures.accountId, accountId), gt(loginFailures.at, now - LOCKOUT.windowMs)),
    )
    .get()?.n ?? 0;

export const isLocked = (db: Db, accountId: string, now: number) =>
  recentFailures(db, accountId, now) >= LOCKOUT.failures;

export const recordFailure = (db: Db, accountId: string, now: number) =>
  db.insert(loginFailures).values({ accountId, at: now }).run();

export const clearFailures = (db: Db, accountId: string) =>
  db.delete(loginFailures).where(eq(loginFailures.accountId, accountId)).run();
