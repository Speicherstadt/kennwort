// The tables of the sync (K-204, docs/sicherheitsdesign.md P-21): vaults and every version of every
// entry as the client sealed and signed it. Nothing here can be read without the vault key.
import { blob, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { companies } from "./schema.ts";

/** A vault belongs to one company; who is a member is in its signed log, checked by the client */
export const vaults = sqliteTable(
  "vaults",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("vaults_company").on(table.companyId)],
);

const bytes = (name: string) => blob(name, { mode: "buffer" }).notNull();

/** One version of an entry: sealed entry key, sealed content and the author's signature (F-01, P-09) */
export const entryRecords = sqliteTable(
  "entry_records",
  {
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id),
    entryId: text("entry_id").notNull(),
    version: integer("version").notNull(),
    epoch: integer("epoch").notNull(),
    entryKey: bytes("entry_key"),
    content: bytes("content"),
    author: text("author").notNull(),
    lastSeen: bytes("last_seen"),
    signature: bytes("signature"),
    storedAt: integer("stored_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.vaultId, table.entryId, table.version] })],
);

/**
 * The membership log of a vault (P-06), entry by entry as the signer made it; the hash links the
 * next entry. The server keeps the chain whole, the clients check it (verifyLog)
 */
export const vaultLog = sqliteTable(
  "vault_log",
  {
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id),
    seq: integer("seq").notNull(),
    entry: text("entry").notNull(),
    hash: bytes("hash"),
    storedAt: integer("stored_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.vaultId, table.seq] })],
);

/** A vault key of one epoch wrapped to one member (P-05, F-02); only that member can open it */
export const vaultKeys = sqliteTable(
  "vault_keys",
  {
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id),
    accountId: text("account_id").notNull(),
    epoch: integer("epoch").notNull(),
    wrapped: bytes("wrapped"),
  },
  (table) => [primaryKey({ columns: [table.vaultId, table.accountId, table.epoch] })],
);
