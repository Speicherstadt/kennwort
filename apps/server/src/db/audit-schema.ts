// The audit log (K-205, docs/sicherheitsdesign.md P-20): one hash chain per company
import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { companies } from "./schema.ts";

export const auditEvents = sqliteTable(
  "audit_events",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    seq: integer("seq").notNull(),
    time: integer("time").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subject: text("subject").notNull(),
    signature: blob("signature", { mode: "buffer" }).notNull(),
    prevHash: blob("prev_hash", { mode: "buffer" }).notNull(),
    hash: blob("hash", { mode: "buffer" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.seq] })],
);
