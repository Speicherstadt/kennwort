// A server with sign-in for tests: Weber Haustechnik with Jonas as owner, a clock the test moves
import { encodeBytes } from "@kennwort/core";
import { createApp } from "../app.ts";
import { authenticateWith, createAuth } from "../auth/better-auth.ts";
import { clientAddress } from "../auth/client-address.ts";
import { rateLimiter } from "../auth/limits.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import { createLog, type Log } from "../log.ts";
import type { PushDeps } from "../notifications/push.ts";

export const SECRET = "test-secret-of-at-least-thirty-two-chars";

/** What a client sends to invite: an ID it picked and its sealed secret, here random bytes (P-08) */
export const invitationBody = (label: string) => ({
  id: encodeBytes(crypto.getRandomValues(new Uint8Array(16))),
  sealedSecret: encodeBytes(crypto.getRandomValues(new Uint8Array(73))),
  label,
});

export const signInSetup = async (
  options: {
    rateLimit?: number;
    behindProxy?: boolean;
    setupCode?: string;
    empty?: boolean;
    /** The API runs on the test's clock too, not only sign-in (emergency access, K-307 part d) */
    apiClock?: boolean;
    /** Where the server's log lines go; none are kept by default */
    log?: Log;
    /** Web Push with a fake push service (K-602) */
    push?: PushDeps;
  } = {},
) => {
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
    address: clientAddress(options.behindProxy ?? false),
    setupCode: options.setupCode,
  };
  const app = createApp({
    db,
    log: options.log ?? createLog("error", () => {}),
    authenticate: authenticateWith(auth),
    signIn,
    push: options.push,
    ...(options.apiClock ? { now: clock.now } : {}),
  });
  // A fresh server for the first owner's setup has no company yet
  if (!options.empty)
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
    init: {
      method?: string;
      token?: string;
      body?: unknown;
      ip?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    app.request(
      path,
      {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          "content-type": "application/json",
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      },
      // The socket address, as main.ts hands it over from Bun
      { address: init.ip ?? "192.0.2.1" },
    );
  return { app, db, clock, member, request };
};
