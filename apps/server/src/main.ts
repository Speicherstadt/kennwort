// Starts the server: settings, database with migrations, HTTP on the configured port
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.ts";
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
const { port, database, logLevel } = config.value;
const log = createLog(logLevel, (line) => console.log(line));

if (database !== ":memory:") mkdirSync(dirname(database), { recursive: true });
const db = openDatabase(database);
migrate(db);
// Until K-203 brings sign-in, no request has a session: /api answers 401
const authenticate = async () => undefined;
const server = Bun.serve({ port, fetch: createApp({ db, log, authenticate }).fetch });
log("info", "listening", { port: server.port });
