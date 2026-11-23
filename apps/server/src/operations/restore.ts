/**
 * Puts a backup in place of the database (K-703), only while no server has it open: a running
 * server would keep writing into the file it opened and lose every write after the restore. The
 * check asks SQLite to leave WAL mode, which it refuses while any other connection is open
 * (https://sqlite.org/pragma.html#pragma_journal_mode); the server goes back to WAL when it starts.
 * The backup must be whole and must come from this version or an older one: a schema this server
 * does not know it cannot migrate. The database it replaces is kept beside it, never deleted.
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { EmbeddedMigration } from "../db/embed.ts";
import { migrations } from "../db/migrations.gen.ts";
import { isIntact } from "./backup.ts";
import { err, ok } from "./result.ts";

export type RestoreError =
  | "no-backup"
  | "damaged-backup"
  | "not-kennwort"
  | "newer-schema"
  | "in-use";

/** The hashes drizzle-orm writes into __drizzle_migrations, as database.ts computes them */
const knownHashes = (list: readonly EmbeddedMigration[]) =>
  new Set(list.map((migration) => createHash("sha256").update(migration.sql).digest("hex")));

/** The migrations a database went through; undefined when it is no Kennwort database */
const appliedHashes = (path: string) => {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db.query("SELECT hash FROM __drizzle_migrations").all() as { hash: string }[];
    return rows.map((row) => row.hash);
  } catch {
    return undefined;
  } finally {
    db.close();
  }
};

/** False while another connection, such as a running server, has the database open */
const notInUse = (path: string) => {
  try {
    const db = new Database(path);
    try {
      db.query("PRAGMA journal_mode = DELETE").get();
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
};

const checkBackup = (backup: string, list: readonly EmbeddedMigration[]) => {
  if (!existsSync(backup)) return err<RestoreError>("no-backup");
  if (!isIntact(backup)) return err<RestoreError>("damaged-backup");
  const applied = appliedHashes(backup);
  if (!applied || applied.length === 0) return err<RestoreError>("not-kennwort");
  const known = knownHashes(list);
  if (!applied.every((hash) => known.has(hash))) return err<RestoreError>("newer-schema");
  return ok(applied.length);
};

const randomSuffix = () => Buffer.from(crypto.getRandomValues(new Uint8Array(6))).toString("hex");

/**
 * Creates the file anew, readable by the owner alone from the first byte: "wx" fails on anything
 * already there, a planted link included, so nothing is written through it (review of K-703)
 */
const writeExclusive = (path: string, data: Uint8Array) => {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
};

export type RestoreDeps = {
  now: () => number;
  /** The migrations this server knows; only tests pass others */
  migrations?: readonly EmbeddedMigration[];
};

export const restoreDatabase = (backup: string, database: string, deps: RestoreDeps) => {
  const checked = checkBackup(backup, deps.migrations ?? migrations);
  if (!checked.ok) return checked;
  if (existsSync(database) && !notInUse(database)) return err<RestoreError>("in-use");
  mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  const incoming = `${database}.restoring-${randomSuffix()}`;
  writeExclusive(incoming, readFileSync(backup));
  const replaced = existsSync(database) ? `${database}.replaced-${deps.now()}` : undefined;
  if (replaced) renameSync(database, replaced);
  // Left over only from a server that did not shut down cleanly; they belong to the old file
  for (const suffix of ["-wal", "-shm"]) rmSync(`${database}${suffix}`, { force: true });
  renameSync(incoming, database);
  return ok({ replaced, migrations: checked.value });
};
