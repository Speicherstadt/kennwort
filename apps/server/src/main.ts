// Starts the server: settings, database with migrations, HTTP on the configured port
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.ts";
import { authenticateWith, createAuth } from "./auth/better-auth.ts";
import { clientAddress } from "./auth/client-address.ts";
import { rateLimiter } from "./auth/limits.ts";
import { readConfig } from "./config.ts";
import { migrate, openDatabase } from "./db/database.ts";
import { createLog } from "./log.ts";
import { PUSH_HOSTS, pushHostAllowed } from "./notifications/push.ts";
import { loadVapid } from "./notifications/vapid.ts";
import { PWNED_LIMIT } from "./pwned/routes.ts";
import { upstreamRanges } from "./pwned/upstream.ts";

const config = readConfig(process.env);
if (!config.ok) {
  // A log line for operators, not a text of the interface
  const failure = { level: "error", message: "invalid settings", fields: config.error }; // i18n-ignore
  console.error(JSON.stringify(failure));
  process.exit(1);
}
const {
  port,
  database,
  logLevel,
  publicUrl,
  authSecret,
  behindProxy,
  setupCode,
  pwnedUrl,
  webRoot,
  secure,
} = config.value;
const log = createLog(logLevel, (line) => console.log(line));

if (database !== ":memory:") mkdirSync(dirname(database), { recursive: true });
const db = openDatabase(database);
migrate(db);
const origin = new URL(publicUrl).origin;
const auth = createAuth(db, {
  secret: authSecret,
  baseURL: origin,
  rpID: new URL(publicUrl).hostname,
  origin,
});
const signIn = {
  auth,
  secret: authSecret,
  now: Date.now,
  random: (length: number) => crypto.getRandomValues(new Uint8Array(length)),
  allow: rateLimiter(20, 60_000),
  address: clientAddress(behindProxy),
  setupCode,
};
// Web Push (K-602): the VAPID key is made at the first start and kept in the database
const pushConfig = config.value.push;
const vapid = pushConfig ? loadVapid(db, Date.now()) : undefined;
const push =
  pushConfig && vapid
    ? {
        fetch: (url: string, init: RequestInit) => fetch(url, init),
        vapid: () => vapid,
        subject: pushConfig.subject,
        allowHost: pushHostAllowed([...PUSH_HOSTS, ...pushConfig.extraHosts]),
      }
    : undefined;
// The leak check's proxy (K-603) asks the configured service with nothing but a SHA-1 prefix
const pwned = pwnedUrl
  ? {
      ranges: upstreamRanges({ url: pwnedUrl, fetch, now: Date.now }),
      allow: rateLimiter(PWNED_LIMIT.max, PWNED_LIMIT.windowMs),
    }
  : undefined;
const app = createApp({
  db,
  log,
  authenticate: authenticateWith(auth),
  signIn,
  push,
  pwned,
  webRoot,
  secure,
});
// The peer address goes to the app as its environment; the rate limits count it
const server = Bun.serve({
  port,
  // Bun closes a connection after 10 s without data by default; the live sync pings every 20 s
  idleTimeout: 60,
  fetch: (request, bun) => app.fetch(request, { address: bun.requestIP(request)?.address }),
});
log("info", "listening", { port: server.port });
