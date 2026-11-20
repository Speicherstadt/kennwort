import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "./db/database.ts";
import { migrationsModule, readMigrations } from "./db/embed.ts";
import { migrations } from "./db/migrations.gen.ts";

const tables = (db: ReturnType<typeof openDatabase>) =>
  db
    .all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`)
    .map((row) => row.name);

describe("database", () => {
  it("migrates an empty database to the newest schema", () => {
    const db = openDatabase(":memory:");
    expect(tables(db)).toEqual([]);
    migrate(db);
    expect(tables(db)).toEqual([
      "__drizzle_migrations",
      "account_keys",
      "accounts",
      "audit_events",
      "auth_account",
      "auth_passkey",
      "auth_session",
      "auth_user",
      "auth_verification",
      "companies",
      "device_sessions",
      "entry_records",
      "group_members",
      "groups",
      "instance",
      "invitations",
      "login_challenges",
      "login_failures",
      "login_keys",
      "pairings",
      "root_grants",
      "sqlite_sequence",
      "vault_groups",
      "vault_keys",
      "vault_log",
      "vault_requests",
      "vaults",
    ]);
  });

  it("runs each migration once", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    migrate(db);
    expect(db.all(sql`select * from __drizzle_migrations`)).toHaveLength(migrations.length);
  });

  it("carries exactly the migrations of drizzle/ (run `bun run db:generate` after a schema change)", async () => {
    const { readFileSync } = await import("node:fs");
    const root = join(import.meta.dirname, "..");
    expect(readFileSync(join(root, "src/db/migrations.gen.ts"), "utf8")).toBe(
      migrationsModule(readMigrations(join(root, "drizzle"))),
    );
  });
});
