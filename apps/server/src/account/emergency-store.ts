/**
 * The emergency grants of one company (K-307 part d, P-14). Like every scope, each query filters by
 * the session's company: a grant between accounts of another company does not exist here, nor one
 * with an account that left.
 */
import { EmergencyGrant } from "@kennwort/core";
import { aliasedTable, and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { accounts, emergencyGrants, emergencyRevocations } from "../db/schema.ts";

export type GrantRow = typeof emergencyGrants.$inferSelect;
export type ReleaseState = "none" | "waiting" | "objected" | "released";

const waitOf = (row: GrantRow) => EmergencyGrant.parse(JSON.parse(row.grant)).waitSeconds;

/** When the packages come out (ms), by the server's clock: after the request and the wait */
export const releaseAt = (row: GrantRow) =>
  row.requestedAt === null ? null : row.requestedAt + waitOf(row) * 1000;

/** Where a grant stands at a time (ms): no request, waiting, objected or released */
export const releaseState = (row: GrantRow, now: number): ReleaseState => {
  const at = releaseAt(row);
  if (row.request === null || at === null) return "none";
  if (row.objection !== null) return "objected";
  return row.approval !== null || now >= at ? "released" : "waiting";
};

/** A grant as GET /api/emergency lists it, without its packages */
export const listed = (row: GrantRow) => {
  const at = releaseAt(row);
  const json = (text: string | null) => (text === null ? null : JSON.parse(text));
  return {
    grant: JSON.parse(row.grant),
    request: json(row.request),
    objection: json(row.objection),
    approval: json(row.approval),
    releaseAt: at === null ? null : Math.floor(at / 1000),
  };
};

const grantee = aliasedTable(accounts, "grantee");
const grantor = aliasedTable(accounts, "grantor");

export const emergencyStore = (db: Db, companyId: string) => {
  /** Rows whose grantor and grantee are both current accounts of the company */
  const rows = (...where: ReturnType<typeof eq>[]) =>
    db
      .select({ row: emergencyGrants })
      .from(emergencyGrants)
      .innerJoin(grantor, eq(grantor.id, emergencyGrants.grantor))
      .innerJoin(grantee, eq(grantee.id, emergencyGrants.grantee))
      .where(
        and(
          eq(grantor.companyId, companyId),
          eq(grantee.companyId, companyId),
          isNull(grantor.leftAt),
          isNull(grantee.leftAt),
          ...where,
        ),
      )
      .all()
      .map(({ row }) => row);
  const pair = (from: string, to: string) =>
    and(eq(emergencyGrants.grantor, from), eq(emergencyGrants.grantee, to));
  return {
    row: (from: string, to: string): GrantRow | undefined =>
      rows(eq(emergencyGrants.grantor, from), eq(emergencyGrants.grantee, to))[0],
    given: (from: string) => rows(eq(emergencyGrants.grantor, from)),
    received: (to: string) => rows(eq(emergencyGrants.grantee, to)),
    revocations: (to: string) =>
      db
        .select({ statement: emergencyRevocations.statement })
        .from(emergencyRevocations)
        .innerJoin(grantor, eq(grantor.id, emergencyRevocations.grantor))
        .where(and(eq(grantor.companyId, companyId), eq(emergencyRevocations.grantee, to)))
        .all()
        .map(({ statement }) => JSON.parse(statement)),
    /** Stores a grant; the caller has checked the accounts are of this company */
    put: (row: GrantRow) =>
      db
        .insert(emergencyGrants)
        .values(row)
        .onConflictDoUpdate({
          target: [emergencyGrants.grantor, emergencyGrants.grantee],
          set: row,
        })
        .run(),
    update: (from: string, to: string, set: Partial<GrantRow>) =>
      db.update(emergencyGrants).set(set).where(pair(from, to)).run(),
    /** The grant is gone; its signed revocation stays for the grantee to see */
    revoke: (from: string, to: string, statement: string, at: number) =>
      db.transaction((tx) => {
        tx.delete(emergencyGrants).where(pair(from, to)).run();
        const row = { grantor: from, grantee: to, statement, storedAt: at };
        tx.insert(emergencyRevocations)
          .values(row)
          .onConflictDoUpdate({
            target: [emergencyRevocations.grantor, emergencyRevocations.grantee],
            set: row,
          })
          .run();
      }),
  };
};

export type EmergencyStore = ReturnType<typeof emergencyStore>;
