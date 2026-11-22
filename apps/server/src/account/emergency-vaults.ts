/**
 * What a grantee reads once the packages are out (K-307 part d, P-14): for view access the vaults
 * the grant names, for full access every vault with the grantor's wrapped keys, either only while
 * the grantor is a current member of it; each with its sealed name, its signed log and the newest
 * record of every entry. The grantee's client checks the log and opens nothing the released keys do not bind.
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

/** Of these vaults, those the grantor is a current member of: the grantee reads no more than it */
const stillMember = (deps: Deps, grantor: string, ids: readonly string[]) => {
  const seconds = Math.floor(deps.now() / 1000);
  return [...new Set(ids)].filter((id) => currentMembers(deps.db, id, seconds).has(grantor));
};

/** The vaults a grant opens: for full access every vault the grantor holds keys of, else the named */
const grantedVaults = (deps: Deps, grant: EmergencyGrant, grantor: string) =>
  grant.scope === "full"
    ? deps.db
        .select()
        .from(vaultKeys)
        .where(eq(vaultKeys.accountId, grantor))
        .all()
        .map((row) => row.vaultId)
    : grant.items.map((i) => encodeBytes(i.vaultId));

export const emergencyVaults = (
  deps: Deps,
  scope: CompanyScope,
  grant: EmergencyGrant,
  grantor: string,
) => {
  const full = grant.scope === "full";
  const ids = stillMember(deps, grantor, grantedVaults(deps, grant, grantor));
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
