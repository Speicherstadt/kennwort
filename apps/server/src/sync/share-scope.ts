/**
 * The shares of single entries of one company (K-305 part 6, P-10). As in the sync scope, every
 * query goes through the company's vaults: a share in a vault of another company does not exist.
 */
import { encodeBytes, Share } from "@kennwort/core";
import { and, asc, eq, gt, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { entryShares, vaults } from "../db/schema.ts";

type Row = typeof entryShares.$inferSelect;

const toRow = (share: Share, storedAt: number): Row => ({
  vaultId: encodeBytes(share.vaultId),
  entryId: encodeBytes(share.entryId),
  recipient: encodeBytes(share.recipient),
  role: share.role,
  validUntil: share.validUntil,
  commitment: Buffer.from(share.commitment),
  wrappedKey: Buffer.from(share.wrappedKey),
  sharer: encodeBytes(share.sharer),
  time: share.time,
  signature: Buffer.from(share.signature),
  storedAt,
});

/** A stored row back as the share the sharer signed; the schema checks it once more */
const toShare = (row: Row): Share =>
  Share.parse({
    vaultId: row.vaultId,
    entryId: row.entryId,
    recipient: row.recipient,
    role: row.role,
    validUntil: row.validUntil,
    commitment: encodeBytes(row.commitment),
    wrappedKey: encodeBytes(row.wrappedKey),
    sharer: row.sharer,
    time: row.time,
    signature: encodeBytes(row.signature),
  });

const shareRow = (vaultId: string, entryId: string, recipient: string) =>
  and(
    eq(entryShares.vaultId, vaultId),
    eq(entryShares.entryId, entryId),
    eq(entryShares.recipient, recipient),
  );

/** Without expiry, or not expired at this time (seconds), as the client counts it */
const unexpired = (seconds: number) =>
  or(eq(entryShares.validUntil, 0), gt(entryShares.validUntil, seconds));

export const shareScope = (db: Db, companyId: string) => {
  const inCompany = (...conditions: (SQL | undefined)[]) =>
    db
      .select({ row: entryShares })
      .from(entryShares)
      .innerJoin(vaults, eq(vaults.id, entryShares.vaultId))
      .where(and(eq(vaults.companyId, companyId), ...conditions));

  return {
    /** The shares of one entry, by recipient */
    shares: (vaultId: string, entryId: string) =>
      inCompany(eq(entryShares.vaultId, vaultId), eq(entryShares.entryId, entryId))
        .orderBy(asc(entryShares.recipient))
        .all()
        .map(({ row }) => toShare(row)),
    /** Stores a share; an earlier one to the same recipient gives way */
    share: (share: Share, storedAt: number) => {
      const row = toRow(share, storedAt);
      db.insert(entryShares)
        .values(row)
        .onConflictDoUpdate({
          target: [entryShares.vaultId, entryShares.entryId, entryShares.recipient],
          set: row,
        })
        .run();
    },
    unshare: (vaultId: string, entryId: string, recipient: string) => {
      db.delete(entryShares)
        .where(shareRow(vaultId, entryId, recipient))
        .run();
    },
    /** What was shared with this account and has not expired, by vault and entry */
    sharedWith: (accountId: string, seconds: number) =>
      inCompany(eq(entryShares.recipient, accountId), unexpired(seconds))
        .orderBy(asc(entryShares.vaultId), asc(entryShares.entryId))
        .all()
        .map(({ row }) => toShare(row)),
    /** Whether this account holds a share of the entry that has not expired */
    isSharedWith: (accountId: string, vaultId: string, entryId: string, seconds: number) =>
      inCompany(
        eq(entryShares.vaultId, vaultId),
        eq(entryShares.entryId, entryId),
        eq(entryShares.recipient, accountId),
        unexpired(seconds),
      ).get() !== undefined,
  };
};
