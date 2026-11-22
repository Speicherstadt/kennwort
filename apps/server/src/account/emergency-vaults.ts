/**
 * What a grantee reads once the packages are out (K-307 part d, P-14): for view access the vaults
 * the grant names, for full access every vault the grantor is a current member of with the
 * grantor's wrapped keys; each with its sealed name, its signed log and the newest record of every
 * entry. The grantee's client checks the log and opens nothing the released keys do not bind.
 */
import { type EmergencyGrant, encodeBytes, recordToWire, toWire } from "@kennwort/core";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { vaultKeys } from "../db/schema.ts";
import { currentMembers, storedEntries } from "../sync/vault-chain.ts";
import type { CompanyScope } from "../tenancy/scope.ts";

type Deps = { db: Db; now: () => number };

const keysOf = (db: Db, vaultId: string, accountId: string) =>
  db
    .select()
    .from(vaultKeys)
    .where(and(eq(vaultKeys.vaultId, vaultId), eq(vaultKeys.accountId, accountId)))
    .orderBy(asc(vaultKeys.epoch))
    .all();

/** The vaults a full grant opens: those the grantor holds keys of and is a current member of */
const grantorVaults = (deps: Deps, grantor: string) => {
  const held = deps.db.select().from(vaultKeys).where(eq(vaultKeys.accountId, grantor)).all();
  const seconds = Math.floor(deps.now() / 1000);
  return [...new Set(held.map((row) => row.vaultId))].filter((id) =>
    currentMembers(deps.db, id, seconds).has(grantor),
  );
};

export const emergencyVaults = (
  deps: Deps,
  scope: CompanyScope,
  grant: EmergencyGrant,
  grantor: string,
) => {
  const full = grant.scope === "full";
  const ids = full ? grantorVaults(deps, grantor) : grant.items.map((i) => encodeBytes(i.vaultId));
  return ids.flatMap((id) => {
    const vault = scope.vault(id);
    if (!vault) return [];
    return [
      {
        id,
        name: vault.name ? encodeBytes(vault.name) : null,
        nameEpoch: vault.nameEpoch ?? null,
        log: storedEntries(deps.db, id).map((entry) => toWire(entry)),
        keys: full
          ? keysOf(deps.db, id, grantor).map((row) => ({
              epoch: row.epoch,
              wrapped: encodeBytes(row.wrapped),
            }))
          : [],
        records: (scope.latest(id) ?? []).map(recordToWire),
      },
    ];
  });
};
