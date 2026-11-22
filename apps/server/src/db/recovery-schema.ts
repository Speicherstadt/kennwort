// Company recovery (K-307 part c, docs/sicherheitsdesign.md P-13): the recovery key wrapped to each
// owner and each account's deposit of its AK. The server cannot open either; it keeps and hands out.
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./schema.ts";

const bytes = (name: string) => blob(name, { mode: "buffer" }).notNull();

/** The recovery key's private half wrapped to an owner's certified bundle (F-02) */
export const recoveryGrants = sqliteTable("recovery_grants", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  wrapped: bytes("wrapped"),
  createdAt: integer("created_at").notNull(),
});

/** An account's AK wrapped to the recovery key, signed by the account (F-08) */
export const recoveryDeposits = sqliteTable("recovery_deposits", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  pkg: bytes("pkg"),
  commitment: bytes("commitment"),
  signature: bytes("signature"),
  storedAt: integer("stored_at").notNull(),
});
