// The server's tables (Drizzle). It stores only ciphertexts, signed entries and public keys
// (docs/sicherheitsdesign.md, P-15); the tables for those follow with K-202 and later.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row: this installation, created on the first start */
export const instance = sqliteTable("instance", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});
