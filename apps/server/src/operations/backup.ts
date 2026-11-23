/**
 * A consistent copy of the database while the server runs (K-703): SQLite's `VACUUM INTO` reads
 * one snapshot through a read-only connection, so the server keeps writing in WAL mode and the copy
 * still holds one moment, never half a transaction (https://sqlite.org/lang_vacuum.html#vacuuminto).
 * The copy is written next to its target under another name, checked with `integrity_check` and
 * only then renamed, so a target that exists is always a whole backup. What it holds is ciphertext
 * and public data only (docs/betrieb.md, "Was ein Backup enthält").
 */
import { Database } from "bun:sqlite";
import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { err, ok } from "./result.ts";

export type BackupError = "no-database" | "target-exists" | "damaged-copy";

/** True when SQLite reads the file as a whole, undamaged database */
export const isIntact = (path: string) => {
  try {
    const db = new Database(path, { readonly: true });
    try {
      const rows = db.query("PRAGMA integrity_check").all() as { integrity_check: string }[];
      return rows.length === 1 && rows[0]?.integrity_check === "ok";
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
};

const randomSuffix = () => Buffer.from(crypto.getRandomValues(new Uint8Array(6))).toString("hex");

export type BackupDeps = {
  /** Checks the copy before it is renamed; only tests pass another, to look at it in between */
  isIntact?: (path: string) => boolean;
};

export const backupDatabase = (database: string, target: string, deps: BackupDeps = {}) => {
  if (database === ":memory:" || !existsSync(database)) return err<BackupError>("no-database");
  if (existsSync(target)) return err<BackupError>("target-exists");
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const partial = `${target}.partial-${randomSuffix()}`;
  try {
    // Created empty, exclusively and 0600 before SQLite writes into it (it accepts an empty
    // target), so no umask ever makes the copy readable by others (review of K-703)
    closeSync(openSync(partial, "wx", 0o600));
    const source = new Database(database, { readonly: true });
    try {
      source.query("VACUUM INTO ?").run(partial);
    } finally {
      source.close();
    }
    if (!(deps.isIntact ?? isIntact)(partial)) return err<BackupError>("damaged-copy");
    renameSync(partial, target);
    return ok({ bytes: statSync(target).size });
  } finally {
    rmSync(partial, { force: true });
  }
};
