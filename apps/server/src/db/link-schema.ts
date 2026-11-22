// One-time links (K-601, docs/sicherheitsdesign.md P-18): the F-15 ciphertext, how long it lasts and
// how many fetches are left. The server never sees the link secret, which stays in the fragment.
import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts, companies } from "./schema.ts";

export const oneTimeLinks = sqliteTable(
  "one_time_links",
  {
    /** The public ID its creator lists and revokes it by, and the audit log names */
    id: text("id").primaryKey(),
    /**
     * SHA-256 of the fetch ID in the address, hex: the server looks a link up by a hash, so the
     * lookup's timing says nothing about the ID, and the database alone fetches nothing
     */
    fetchHash: text("fetch_hash").notNull().unique(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => accounts.id),
    ciphertext: blob("ciphertext", { mode: "buffer" }).notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    maxFetches: integer("max_fetches").notNull(),
    remaining: integer("remaining").notNull(),
  },
  (table) => [
    index("one_time_links_creator").on(table.createdBy),
    index("one_time_links_expiry").on(table.expiresAt),
  ],
);
