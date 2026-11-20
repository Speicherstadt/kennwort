// The server's tables (Drizzle). It stores only ciphertexts, signed entries and public keys
// (docs/sicherheitsdesign.md, P-15); the tables for those follow with K-202 and later.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row: this installation, created on the first start */
export const instance = sqliteTable("instance", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

/** A company (tenant); one server can hold many, strictly apart (K-202) */
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

/** An account belongs to exactly one company; its keys and ciphertexts follow in later items */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("accounts_company").on(table.companyId)],
);

export * from "./account-schema.ts";
export * from "./audit-schema.ts";
export * from "./auth-schema.ts";
export * from "./sync-schema.ts";
