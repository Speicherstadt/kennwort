// Starts the server: settings, database with migrations, HTTP on the configured port
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { migrate, openDatabase } from "./db/database.ts";
import { createLog } from "./log.ts";

const config = readConfig(process.env);
if (!config.ok) {
  console.error(
    JSON.stringify({ level: "error", message: "invalid settings", fields: config.error }),
  );
  process.exit(1);
}
const { port, database, logLevel } = config.value;
const log = createLog(logLevel, (line) => console.log(line));

if (database !== ":memory:") mkdirSync(dirname(database), { recursive: true });
const db = openDatabase(database);
migrate(db);
const server = Bun.serve({ port, fetch: createApp({ db, log }).fetch });
log("info", "listening", { port: server.port });
