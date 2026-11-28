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
      "emergency_grants",
      "emergency_revocations",
      "entry_records",
      "entry_shares",
      "instance",
      "invitations",
      "login_challenges",
      "login_failures",
      "login_keys",
      "notification_prefs",
      "notifications",
      "oidc_companies",
      "oidc_flows",
      "oidc_identities",
      "oidc_tickets",
      "one_time_links",
      "pairings",
      "push_subscriptions",
      "recovery_deposits",
      "recovery_grants",
      "root_changes",
      "root_grants",
      "server_keys",
      "sqlite_sequence",
      "superseded_certificates",
      "unlock_passkeys",
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

  it("drops groups without losing vault members, logs, keys or non-group notifications", () => {
    const db = openDatabase(":memory:");
    // Bring up to 0027 (before dropping groups)
    migrate(db, migrations.slice(0, -1));
    db.run(sql`INSERT INTO companies (id, created_at) VALUES ('weber', 1)`);
    db.run(
      sql`INSERT INTO accounts (id, company_id, role, created_at) VALUES ('jonas', 'weber', 'owner', 1), ('anna', 'weber', 'member', 2)`,
    );
    db.run(sql`INSERT INTO vaults (id, company_id, created_at) VALUES ('buero', 'weber', 1)`);
    db.run(
      sql`INSERT INTO vault_log (vault_id, seq, hash, entry, stored_at) VALUES ('buero', 0, X'01', '{"action":"create"}', 1), ('buero', 1, X'02', '{"action":"add","accountId":"anna"}', 2)`,
    );
    db.run(
      sql`INSERT INTO vault_keys (vault_id, account_id, epoch, wrapped) VALUES ('buero', 'jonas', 0, X'aa'), ('buero', 'anna', 0, X'bb')`,
    );
    db.run(
      sql`INSERT INTO groups (id, company_id, name, created_at) VALUES ('g1', 'weber', 'Technik', 1)`,
    );
    db.run(sql`INSERT INTO group_members (group_id, account_id, via_idp) VALUES ('g1', 'anna', 1)`);
    db.run(sql`INSERT INTO vault_groups (vault_id, group_id, role) VALUES ('buero', 'g1', 'edit')`);
    db.run(
      sql`INSERT INTO vault_requests (vault_id, account_id, requested_at, via_group) VALUES ('buero', 'anna', 5, 'g1')`,
    );
    db.run(
      sql`INSERT INTO oidc_tickets (ticket_hash, issuer, subject, groups, expires_at) VALUES ('t1', 'https://idp', 'sub1', '["Technik"]', 99)`,
    );
    db.run(
      sql`INSERT INTO notifications (id, company_id, account_id, kind, created_at) VALUES ('n1', 'weber', 'jonas', 'group-left', 1), ('n2', 'weber', 'jonas', 'vault-added', 2)`,
    );
    db.run(
      sql`INSERT INTO notification_prefs (account_id, prefs) VALUES ('jonas', '{"push":["root-changed","group-left"]}')`,
    );

    migrate(db);

    expect(tables(db)).not.toContain("groups");
    expect(tables(db)).not.toContain("group_members");
    expect(tables(db)).not.toContain("vault_groups");
    expect(db.all(sql`SELECT seq FROM vault_log WHERE vault_id = 'buero' ORDER BY seq`)).toEqual([
      { seq: 0 },
      { seq: 1 },
    ]);
    expect(
      db.all(sql`SELECT account_id FROM vault_keys WHERE vault_id = 'buero' ORDER BY account_id`),
    ).toEqual([{ account_id: "anna" }, { account_id: "jonas" }]);
    expect(db.all(sql`SELECT vault_id, account_id FROM vault_requests`)).toEqual([
      { vault_id: "buero", account_id: "anna" },
    ]);
    expect(db.all(sql`SELECT id, kind FROM notifications ORDER BY id`)).toEqual([
      { id: "n2", kind: "vault-added" },
    ]);
    expect(db.all(sql`SELECT prefs FROM notification_prefs WHERE account_id = 'jonas'`)).toEqual([
      { prefs: '{"push":["root-changed"]}' },
    ]);
  });
});
