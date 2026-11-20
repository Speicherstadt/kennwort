// Starts the server: settings, database with migrations, HTTP on the configured port
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.ts";
import { authenticateWith, createAuth } from "./auth/better-auth.ts";
import { rateLimiter } from "./auth/limits.ts";
import { readConfig } from "./config.ts";
import { migrate, openDatabase } from "./db/database.ts";
import { createLog } from "./log.ts";

const config = readConfig(process.env);
if (!config.ok) {
  // A log line for operators, not a text of the interface
  const failure = { level: "error", message: "invalid settings", fields: config.error }; // i18n-ignore
  console.error(JSON.stringify(failure));
  process.exit(1);
}
const { port, database, logLevel, publicUrl, authSecret } = config.value;
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
};
const app = createApp({ db, log, authenticate: authenticateWith(auth), signIn });
const server = Bun.serve({ port, fetch: app.fetch });
log("info", "listening", { port: server.port });
