// Migration 0017 (review): a vault created before it keeps its creator, taken from the audit log
import { describe, expect, it } from "bun:test";
import { migrate, openDatabase } from "../db/database.ts";
import { migrations } from "../db/migrations.gen.ts";

describe("0017_vault_creator on an existing database", () => {
  it("knows who created a vault that was made before the upgrade", () => {
    const db = openDatabase(":memory:");
    const before = migrations.findIndex((m) => m.tag === "0017_vault_creator");
    migrate(db, migrations.slice(0, before));
    const sqlite = db.$client;
    sqlite.exec("PRAGMA foreign_keys = OFF;");
    // What POST /api/vaults left before 0017: the vault row and its audit event with the actor
    sqlite
      .query("INSERT INTO vaults (id, company_id, created_at) VALUES (?, ?, ?)")
      .run("vault-1", "weber", 1);
    sqlite
      .query(
        "INSERT INTO audit_events (company_id, seq, time, actor, action, subject, signature, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "weber",
        0,
        1,
        "jonas",
        "vault-created",
        "vault-1",
        new Uint8Array(),
        new Uint8Array(32),
        new Uint8Array(32),
      );
    migrate(db);
    const row = sqlite.query("SELECT created_by FROM vaults WHERE id = ?").get("vault-1") as {
      created_by: string | null;
    };
    // Without it the creator's genesis is refused for good (log-routes.ts: createdBy !== accountId)
    expect(row.created_by).toBe("jonas");
  });
});
