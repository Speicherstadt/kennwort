/**
 * The only way routes reach company data: a scope bound to the session's company. Every query in it
 * filters by that company, so no route can read another company's rows by forgetting a condition.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";

export const companyScope = (db: Db, companyId: string) => ({
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
