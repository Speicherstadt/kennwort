import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "../db/database.ts";
import { migrations } from "../db/migrations.gen.ts";
import { companies } from "../db/schema.ts";
import { backupDatabase, isIntact } from "./backup.ts";
import { parseCommand, runCommand } from "./command.ts";
import { restoreDatabase } from "./restore.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "kennwort-ops-"));

/** A migrated database in WAL mode with one row, left open like a running server leaves it */
const liveDatabase = (dir: string) => {
  const path = join(dir, "data", "kennwort.db");
  mkdirSync(join(dir, "data"));
  const db = openDatabase(path);
  migrate(db);
  db.$client.exec("INSERT INTO companies (id, created_at) VALUES ('weber', 1)");
  // Like a server that shuts down: drizzle keeps statements, so close() alone leaves the WAL open
  const stop = () => {
    db.$client.exec("PRAGMA journal_mode = DELETE");
    db.$client.close();
  };
  return { path, db, stop };
};

const companyIds = (path: string) => {
  const db = new Database(path, { readonly: true });
  try {
    return (db.query("SELECT id FROM companies").all() as { id: string }[]).map((row) => row.id);
  } finally {
    db.close();
  }
};

describe("backupDatabase", () => {
  it("copies a database a server has open, whole, readable by the owner alone", () => {
    const dir = scratch();
    const { path, db } = liveDatabase(dir);
    try {
      const target = join(dir, "backups", "kennwort-1.db");
      const result = backupDatabase(path, target);
      expect(result.ok).toBe(true);
      expect(isIntact(target)).toBe(true);
      expect(companyIds(target)).toEqual(companyIds(path));
      expect(statSync(target).mode & 0o777).toBe(0o600);
      // The server goes on writing while and after the backup is taken
      db.$client.exec(`UPDATE companies SET created_at = 2`);
    } finally {
      db.$client.close();
    }
  });

  it("never overwrites a file that is there, and leaves no partial copy behind", () => {
    const dir = scratch();
    const { path, stop } = liveDatabase(dir);
    stop();
    const target = join(dir, "old.db");
    writeFileSync(target, "older backup");
    expect(backupDatabase(path, target)).toEqual({ ok: false, error: "target-exists" });
    expect(readFileSync(target, "utf8")).toBe("older backup");
  });

  it("refuses a database that is not there or only in memory", () => {
    const dir = scratch();
    expect(backupDatabase(join(dir, "none.db"), join(dir, "b.db")).ok).toBe(false);
    expect(backupDatabase(":memory:", join(dir, "b.db")).ok).toBe(false);
    expect(existsSync(join(dir, "b.db"))).toBe(false);
  });
});

describe("restoreDatabase", () => {
  const now = () => 1_800_000_000_000;

  it("puts a backup in place of a stopped server's database and keeps the old one", () => {
    const dir = scratch();
    const { path, db, stop } = liveDatabase(dir);
    const backup = join(dir, "backup.db");
    expect(backupDatabase(path, backup).ok).toBe(true);
    db.$client.exec("DELETE FROM companies");
    stop();
    const result = restoreDatabase(backup, path, { now });
    expect(result).toEqual({
      ok: true,
      value: { replaced: `${path}.replaced-${now()}`, migrations: migrations.length },
    });
    expect(companyIds(path)).toEqual(["weber"]);
    expect(companyIds(`${path}.replaced-${now()}`)).toEqual([]);
    // The restored database opens and migrates like any other
    const reopened = openDatabase(path);
    migrate(reopened);
    expect(reopened.select().from(companies).all()).toHaveLength(1);
    reopened.$client.close();
  });

  it("follows no link planted at its temporary name and writes nowhere else", () => {
    const dir = scratch();
    const { path, stop } = liveDatabase(dir);
    const backup = join(dir, "backup.db");
    expect(backupDatabase(path, backup).ok).toBe(true);
    stop();
    const elsewhere = join(dir, "elsewhere");
    writeFileSync(elsewhere, "untouched", { mode: 0o644 });
    symlinkSync(elsewhere, `${path}.restoring`);
    expect(restoreDatabase(backup, path, { now }).ok).toBe(true);
    expect(readFileSync(elsewhere, "utf8")).toBe("untouched");
    expect(statSync(elsewhere).mode & 0o777).toBe(0o644);
    expect(companyIds(path)).toEqual(["weber"]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("restores into a fresh installation with no database yet", () => {
    const dir = scratch();
    const { path, stop } = liveDatabase(dir);
    stop();
    const fresh = join(dir, "fresh", "data", "kennwort.db");
    expect(restoreDatabase(path, fresh, { now }).ok).toBe(true);
    expect(companyIds(fresh)).toEqual(["weber"]);
  });

  it("refuses while a server has the database open", () => {
    const dir = scratch();
    const { path, db } = liveDatabase(dir);
    const backup = join(dir, "backup.db");
    expect(backupDatabase(path, backup).ok).toBe(true);
    try {
      expect(restoreDatabase(backup, path, { now })).toEqual({ ok: false, error: "in-use" });
    } finally {
      db.$client.close();
    }
  });

  it("refuses a damaged file, a database of something else and a newer schema", () => {
    const dir = scratch();
    const target = join(dir, "kennwort.db");
    const damaged = join(dir, "damaged.db");
    writeFileSync(damaged, "SQLite format 3\0 but nothing else");
    expect(restoreDatabase(damaged, target, { now })).toEqual({
      ok: false,
      error: "damaged-backup",
    });
    const other = join(dir, "other.db");
    new Database(other, { create: true }).exec("CREATE TABLE notes (text)");
    expect(restoreDatabase(other, target, { now })).toEqual({ ok: false, error: "not-kennwort" });
    const { path, stop } = liveDatabase(dir);
    stop();
    const older = { now, migrations: migrations.slice(0, -1) };
    expect(restoreDatabase(path, target, older)).toEqual({ ok: false, error: "newer-schema" });
    expect(restoreDatabase(join(dir, "none.db"), target, { now })).toEqual({
      ok: false,
      error: "no-backup",
    });
    expect(existsSync(target)).toBe(false);
  });
});

describe("parseCommand", () => {
  it("serves without arguments and knows health, backup and restore", () => {
    expect(parseCommand([])).toEqual({ kind: "serve" });
    expect(parseCommand(["health"])).toEqual({ kind: "health" });
    expect(parseCommand(["backup", "/data/b.db"])).toEqual({ kind: "backup", file: "/data/b.db" });
    expect(parseCommand(["restore", "b.db"])).toEqual({ kind: "restore", file: "b.db" });
  });

  it("shows the usage for anything else", () => {
    for (const args of [["backup"], ["restore", "a", "b"], ["health", "x"], ["serve"]])
      expect(parseCommand(args)).toEqual({ kind: "usage" });
  });
});

describe("runCommand", () => {
  const lines: string[] = [];
  const deps = (
    env: Record<string, string>,
    fetch: (url: string) => Promise<Response> = async () => new Response("{}"),
  ) => ({
    env,
    log: (_level: string, message: string) => void lines.push(message),
    fetch,
    now: () => 1,
  });

  it("starts the server for serve", async () => {
    expect(await runCommand({ kind: "serve" }, deps({}))).toBeUndefined();
  });

  it("checks /health on this machine's port", async () => {
    const asked: string[] = [];
    const healthy = async (url: string) => {
      asked.push(url);
      return new Response("{}");
    };
    expect(await runCommand({ kind: "health" }, deps({ KENNWORT_PORT: "8123" }, healthy))).toBe(0);
    expect(asked).toEqual(["http://127.0.0.1:8123/health"]);
    const down = async () => new Response("", { status: 503 });
    expect(await runCommand({ kind: "health" }, deps({}, down))).toBe(1);
    const refused = async () => Promise.reject(new Error("refused"));
    expect(await runCommand({ kind: "health" }, deps({}, refused))).toBe(1);
  });

  it("backs up and restores the configured database, without the auth secret", async () => {
    const dir = scratch();
    const { path, stop } = liveDatabase(dir);
    stop();
    const env = { KENNWORT_DATABASE: path };
    const file = join(dir, "b.db");
    expect(await runCommand({ kind: "backup", file }, deps(env))).toBe(0);
    expect(await runCommand({ kind: "backup", file }, deps(env))).toBe(1);
    expect(await runCommand({ kind: "restore", file }, deps(env))).toBe(0);
    expect(await runCommand({ kind: "usage" }, deps(env))).toBe(2);
  });
});
