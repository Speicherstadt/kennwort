/**
 * The vaults and entry records of one company (K-204). Like the company scope, every query filters
 * by the session's company: a vault of another company does not exist for these functions.
 */
import { EntryRecord, encodeBytes } from "@kennwort/core";
import { and, asc, eq, max, sql } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { entryRecords, vaults } from "../db/schema.ts";

type Row = typeof entryRecords.$inferSelect;

const toRow = (record: EntryRecord, storedAt: number): Row => ({
  vaultId: encodeBytes(record.vaultId),
  entryId: encodeBytes(record.entryId),
  version: record.version,
  epoch: record.epoch,
  entryKey: Buffer.from(record.entryKey),
  content: Buffer.from(record.content),
  author: encodeBytes(record.author),
  lastSeen: Buffer.from(record.lastSeen),
  signature: Buffer.from(record.signature),
  storedAt,
});

/** A stored row back as the record the client signed; the schema checks it once more */
const toRecord = (row: Row): EntryRecord =>
  EntryRecord.parse({
    vaultId: row.vaultId,
    entryId: row.entryId,
    version: row.version,
    epoch: row.epoch,
    entryKey: encodeBytes(row.entryKey),
    content: encodeBytes(row.content),
    author: row.author,
    lastSeen: encodeBytes(row.lastSeen),
    signature: encodeBytes(row.signature),
  });

export type Appended =
  | { stored: true }
  | { stored: false; current: EntryRecord | undefined; epoch?: true };

export const syncScope = (db: Db, companyId: string) => {
  const vault = (vaultId: string) =>
    db
      .select()
      .from(vaults)
      .where(and(eq(vaults.companyId, companyId), eq(vaults.id, vaultId)))
      .get();

  const latestOf = (vaultId: string, entryId: string) => {
    const row = db
      .select()
      .from(entryRecords)
      .where(and(eq(entryRecords.vaultId, vaultId), eq(entryRecords.entryId, entryId)))
      .orderBy(sql`${entryRecords.version} desc`)
      .limit(1)
      .get();
    return row && toRecord(row);
  };

  return {
    vault,
    /** A new vault; an ID that exists anywhere on the server is taken */
    createVault: (vaultId: string, createdAt: number, createdBy: string) => {
      if (db.select().from(vaults).where(eq(vaults.id, vaultId)).get()) return "taken" as const;
      db.insert(vaults).values({ id: vaultId, companyId, createdAt, createdBy }).run();
      return "created" as const;
    },
    /** The newest version of every entry in the vault, or undefined for a vault not in the company */
    latest: (vaultId: string) => {
      if (!vault(vaultId)) return undefined;
      const newest = db
        .select({
          entryId: entryRecords.entryId,
          version: max(entryRecords.version).as("newest_version"),
        })
        .from(entryRecords)
        .where(eq(entryRecords.vaultId, vaultId))
        .groupBy(entryRecords.entryId)
        .as("newest");
      return db
        .select({ row: entryRecords })
        .from(entryRecords)
        .innerJoin(
          newest,
          and(eq(entryRecords.entryId, newest.entryId), eq(entryRecords.version, newest.version)),
        )
        .where(eq(entryRecords.vaultId, vaultId))
        .orderBy(asc(entryRecords.entryId))
        .all()
        .map(({ row }) => toRecord(row));
    },
    /** Every version of one entry, oldest first */
    versions: (vaultId: string, entryId: string) =>
      vault(vaultId)
        ? db
            .select()
            .from(entryRecords)
            .where(and(eq(entryRecords.vaultId, vaultId), eq(entryRecords.entryId, entryId)))
            .orderBy(asc(entryRecords.version))
            .all()
            .map(toRecord)
        : undefined,
    /**
     * Stores a record only as the next version of its entry (P-21) and only in the vault's current
     * epoch (P-11); else names the current one
     */
    append: (record: EntryRecord, storedAt: number, epoch: number): Appended | undefined => {
      const vaultId = encodeBytes(record.vaultId);
      if (!vault(vaultId)) return undefined;
      return db.transaction((tx) => {
        const current = latestOf(vaultId, encodeBytes(record.entryId));
        if (record.epoch !== epoch) return { stored: false, current, epoch: true as const };
        if ((current?.version ?? 0) + 1 !== record.version) return { stored: false, current };
        tx.insert(entryRecords).values(toRow(record, storedAt)).run();
        return { stored: true };
      });
    },
  };
};

export type SyncScope = ReturnType<typeof syncScope>;
