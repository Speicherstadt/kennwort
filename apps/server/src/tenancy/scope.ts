/**
 * The only way routes reach company data: a scope bound to the session's company. Every query in it
 * filters by that company, so no route can read another company's rows by forgetting a condition.
 */

import type { AuditFields } from "@kennwort/core";
import { and, eq } from "drizzle-orm";
import { auditLog, recordAudit } from "../audit/store.ts";
import type { Db } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import { syncScope } from "../sync/scope.ts";
import { shareScope } from "../sync/share-scope.ts";

export const companyScope = (db: Db, companyId: string) => ({
  ...syncScope(db, companyId),
  ...shareScope(db, companyId),
  /** Appends to the company's audit chain (P-20) */
  audit: (fields: Omit<AuditFields, "seq" | "companyId">) =>
    recordAudit(db, { ...fields, companyId }),
  auditLog: () => auditLog(db, companyId),
  company: () => db.select().from(companies).where(eq(companies.id, companyId)).get(),
  accounts: () => db.select().from(accounts).where(eq(accounts.companyId, companyId)).all(),
  account: (accountId: string) =>
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.companyId, companyId), eq(accounts.id, accountId)))
      .get(),
});

export type CompanyScope = ReturnType<typeof companyScope>;
