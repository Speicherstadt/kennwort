/**
 * Opens the SQLite database (bun:sqlite) and brings it to the newest schema with the embedded
 * migrations, the way drizzle-orm's own migrator does from a folder.
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { EmbeddedMigration } from "./embed.ts";
import { migrations } from "./migrations.gen.ts";
import * as schema from "./schema.ts";

export const openDatabase = (path: string) => {
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return drizzle({ client: sqlite, schema });
};

export type Db = ReturnType<typeof openDatabase>;

const toMeta = (migration: EmbeddedMigration) => ({
  sql: migration.sql.split("--> statement-breakpoint"),
  bps: migration.breakpoints,
  folderMillis: migration.when,
  hash: createHash("sha256").update(migration.sql).digest("hex"),
});

// drizzle-orm's migrator does the same with migrations read from a folder; dialect and session
// are not in the public type but are what its own bun-sqlite migrator calls
type Migratable = {
  dialect: {
    migrate: (
      m: ReturnType<typeof toMeta>[],
      session: unknown,
      config: { migrationsFolder: string },
    ) => void;
  };
  session: unknown;
};

export const migrate = (db: Db, list: EmbeddedMigration[] = migrations) => {
  const { dialect, session } = db as unknown as Migratable;
  dialect.migrate(list.map(toMeta), session, { migrationsFolder: "" });
};
