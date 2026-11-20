/**
 * Writes and reads a company's audit chain. Each event is chained to the newest one inside the
 * transaction that stores it, so two events at once cannot share a sequence number.
 */
import { AUDIT_GENESIS, type AuditEvent, type AuditFields, chainAudit } from "@kennwort/core";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { auditEvents } from "../db/schema.ts";

type Row = typeof auditEvents.$inferSelect;

const toEvent = (row: Row): AuditEvent => ({
  ...row,
  action: row.action as AuditEvent["action"],
  signature: new Uint8Array(row.signature),
  prevHash: new Uint8Array(row.prevHash),
  hash: new Uint8Array(row.hash),
});

export const recordAudit = (db: Db, fields: Omit<AuditFields, "seq">): AuditEvent =>
  db.transaction((tx) => {
    const last = tx
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.companyId, fields.companyId))
      .orderBy(desc(auditEvents.seq))
      .limit(1)
      .get();
    const event = chainAudit(last ? new Uint8Array(last.hash) : AUDIT_GENESIS, {
      ...fields,
      seq: last ? last.seq + 1 : 0,
    });
    tx.insert(auditEvents)
      .values({
        ...event,
        signature: Buffer.from(event.signature),
        prevHash: Buffer.from(event.prevHash),
        hash: Buffer.from(event.hash),
      })
      .run();
    return event;
  });

export const auditLog = (db: Db, companyId: string) =>
  db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.companyId, companyId))
    .orderBy(asc(auditEvents.seq))
    .all()
    .map(toEvent);
