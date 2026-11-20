// A server with sign-in for tests: Weber Haustechnik with Jonas as owner, a clock the test moves
import { createApp } from "../app.ts";
import { authenticateWith, createAuth } from "../auth/better-auth.ts";
import { rateLimiter } from "../auth/limits.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import { createLog } from "../log.ts";

export const SECRET = "test-secret-of-at-least-thirty-two-chars";

export const signInSetup = async (options: { rateLimit?: number } = {}) => {
  const db = openDatabase(":memory:");
  migrate(db);
  let time = 1_800_000_000_000;
  const clock = { now: () => time, advance: (ms: number) => (time += ms) };
  const origin = "http://localhost:28100";
  const auth = createAuth(db, { secret: SECRET, baseURL: origin, rpID: "localhost", origin });
  const signIn = {
    auth,
    secret: SECRET,
    now: clock.now,
    random: (length: number) => crypto.getRandomValues(new Uint8Array(length)),
    allow: rateLimiter(options.rateLimit ?? 1000, 60_000, clock.now),
  };
  const app = createApp({
    db,
    log: createLog("error", () => {}),
    authenticate: authenticateWith(auth),
    signIn,
  });
  db.insert(companies)
    .values([
      { id: "weber", createdAt: 1 },
      { id: "mueller", createdAt: 2 },
    ])
    .run();
  const context = await auth.$context;
  const member = async (companyId: string, role: "owner" | "admin" | "member") => {
    const id = crypto.randomUUID();
    const user = await context.internalAdapter.createUser({
      id,
      name: "",
      email: `${id}@accounts.kennwort.invalid`,
      emailVerified: false,
      companyId,
    });
    db.insert(accounts).values({ id: user.id, companyId, role, createdAt: 1 }).run();
    const session = await context.internalAdapter.createSession(user.id);
    return { id: user.id, token: session?.token ?? "" };
  };
  const request = (
    path: string,
    init: { method?: string; token?: string; body?: unknown; ip?: string } = {},
  ) =>
    app.request(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        "content-type": "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.ip ? { "x-forwarded-for": init.ip } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  return { app, db, clock, member, request };
};
