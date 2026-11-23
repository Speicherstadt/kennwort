/**
 * What deleting an account removes from the database (K-607, P-28), in one transaction with the
 * caller. An account that stays in a company keeps only what other members' clients need to check
 * the logs and records it signed: its ID, company, role and the time it left, its public keys and
 * certificates. Everything else of it goes. The last account of a company takes the whole company.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  auditEvents,
  authUser,
  companies,
  deviceSessions,
  emergencyGrants,
  emergencyRevocations,
  entryRecords,
  entryShares,
  groupMembers,
  groups,
  invitations,
  loginChallenges,
  loginFailures,
  loginKeys,
  notificationPrefs,
  notifications,
  oidcCompanies,
  oidcFlows,
  oidcIdentities,
  oidcTickets,
  oneTimeLinks,
  pairings,
  pushSubscriptions,
  recoveryDeposits,
  recoveryGrants,
  rootChanges,
  rootGrants,
  supersededCertificates,
  vaultGroups,
  vaultKeys,
  vaultLog,
  vaultRequests,
  vaults,
} from "../db/schema.ts";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A vault with everything in it: records, log, keys, requests, linked groups and shares */
export const eraseVault = (tx: Tx, vaultId: string) => {
  for (const table of [entryRecords, vaultLog, vaultKeys, vaultRequests, vaultGroups, entryShares])
    tx.delete(table).where(eq(table.vaultId, vaultId)).run();
  tx.delete(vaults).where(eq(vaults.id, vaultId)).run();
};

/**
 * Everything personal of an account: the sign-in (Better Auth's user with its sessions and
 * passkeys, the sign-in key, challenges, failures), devices, push addresses, notifications, the
 * identity provider's person, the sealed key block and state, wrapped root and recovery keys, the
 * recovery deposit, emergency access, one-time links, invitations it made or was given, requests,
 * groups, shares to it and vault keys wrapped to it. Its public keys and certificates stay
 * (`keepPublic`) while the company does: the logs and records it signed must still verify.
 */
export const eraseAccount = (tx: Tx, accountId: string, keepPublic: boolean) => {
  // Its sessions, passkeys and Better Auth sign-in go with the user (on delete cascade)
  tx.delete(deviceSessions).where(eq(deviceSessions.accountId, accountId)).run();
  tx.delete(authUser).where(eq(authUser.id, accountId)).run();
  for (const table of [loginKeys, loginChallenges, loginFailures, pairings])
    tx.delete(table).where(eq(table.accountId, accountId)).run();
  tx.delete(pairings).where(eq(pairings.answeredBy, accountId)).run();
  for (const table of [
    pushSubscriptions,
    notifications,
    notificationPrefs,
    oidcIdentities,
    rootGrants,
    recoveryGrants,
    recoveryDeposits,
    vaultRequests,
    groupMembers,
    vaultKeys,
  ])
    tx.delete(table).where(eq(table.accountId, accountId)).run();
  tx.delete(oidcTickets).where(eq(oidcTickets.accountId, accountId)).run();
  tx.delete(oidcFlows).where(eq(oidcFlows.linkAccount, accountId)).run();
  tx.delete(entryShares).where(eq(entryShares.recipient, accountId)).run();
  for (const table of [emergencyGrants, emergencyRevocations])
    tx.delete(table)
      .where(or(eq(table.grantor, accountId), eq(table.grantee, accountId)))
      .run();
  tx.delete(oneTimeLinks).where(eq(oneTimeLinks.createdBy, accountId)).run();
  // The invitation that brought it in (its label names the person) and the open ones it made; an
  // accepted one it made stays, its label names the colleague it invited
  tx.delete(invitations)
    .where(
      or(
        eq(invitations.accountId, accountId),
        and(eq(invitations.createdBy, accountId), isNull(invitations.acceptedAt)),
      ),
    )
    .run();
  if (keepPublic) {
    // Nothing sealed is left to open: the key block, both boxes of AK and the state are emptied
    const empty = Buffer.alloc(0);
    tx.update(accountKeys)
      .set({
        keyBlock: empty,
        unlockPassphrase: empty,
        unlockRecovery: empty,
        state: empty,
        inviteMac: null,
      })
      .where(eq(accountKeys.accountId, accountId))
      .run();
    return;
  }
  tx.delete(supersededCertificates).where(eq(supersededCertificates.accountId, accountId)).run();
  tx.delete(accountKeys).where(eq(accountKeys.accountId, accountId)).run();
  tx.delete(accounts).where(eq(accounts.id, accountId)).run();
};

/** The whole company: its vaults, every account it ever had, groups, audit chain and root changes */
export const eraseCompany = (tx: Tx, companyId: string) => {
  const vaultIds = tx
    .select({ id: vaults.id })
    .from(vaults)
    .where(eq(vaults.companyId, companyId))
    .all();
  for (const { id } of vaultIds) eraseVault(tx, id);
  const groupIds = tx
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.companyId, companyId))
    .all()
    .map((row) => row.id);
  if (groupIds.length > 0) {
    tx.delete(groupMembers).where(inArray(groupMembers.groupId, groupIds)).run();
    tx.delete(vaultGroups).where(inArray(vaultGroups.groupId, groupIds)).run();
  }
  tx.delete(groups).where(eq(groups.companyId, companyId)).run();
  const accountIds = tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.companyId, companyId))
    .all();
  for (const { id } of accountIds) eraseAccount(tx, id, false);
  // Rows of the company no account names any more
  for (const table of [oneTimeLinks, notifications, invitations, auditEvents, rootChanges])
    tx.delete(table).where(eq(table.companyId, companyId)).run();
  tx.delete(oidcCompanies).where(eq(oidcCompanies.companyId, companyId)).run();
  tx.delete(oidcFlows).where(eq(oidcFlows.companyId, companyId)).run();
  tx.delete(oidcTickets).where(eq(oidcTickets.companyId, companyId)).run();
  tx.delete(authUser).where(eq(authUser.companyId, companyId)).run();
  tx.delete(companies).where(eq(companies.id, companyId)).run();
};
