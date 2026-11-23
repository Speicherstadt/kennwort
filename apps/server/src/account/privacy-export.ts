/**
 * What the server keeps about the account, for the person to download (K-607, Art. 15 and 20
 * GDPR; docs/datenschutz.md lists the same). Everything is read through the session's own account
 * and company. Sealed things go out as they are stored: the server cannot open them, the device
 * can. Secrets of the sign-in itself (session tokens, the challenge) and other people's data do
 * not go out; other accounts appear by ID only, as the server knows them. The entries of the
 * vaults are in the encrypted export of the app (K-504), which only a device can make.
 */
import { encodeBytes } from "@kennwort/core";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  auditEvents,
  authPasskey,
  authSession,
  deviceSessions,
  emergencyGrants,
  entryShares,
  groupMembers,
  groups,
  invitations,
  loginFailures,
  notificationPrefs,
  notifications,
  oidcIdentities,
  oneTimeLinks,
  pushSubscriptions,
  recoveryDeposits,
  supersededCertificates,
  vaultRequests,
  vaults,
} from "../db/schema.ts";
import { membersOf, storedEntries } from "../sync/vault-chain.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

/** The format of the download; a new field keeps the version, a changed meaning raises it */
export const PRIVACY_EXPORT_VERSION = 1;

const bytesOf = (value: Uint8Array | null | undefined) =>
  value && value.length > 0 ? encodeBytes(new Uint8Array(value)) : null;

const keysOf = (db: Db, id: string) => {
  const keys = db.select().from(accountKeys).where(eq(accountKeys.accountId, id)).get();
  if (!keys) return null;
  return {
    xwingPublicKey: bytesOf(keys.xwingPublicKey),
    edPublicKey: bytesOf(keys.edPublicKey),
    certificate: keys.certificate ? (JSON.parse(keys.certificate) as unknown) : null,
    supersededCertificates: db
      .select()
      .from(supersededCertificates)
      .where(eq(supersededCertificates.accountId, id))
      .all()
      .map((row) => ({
        certificate: JSON.parse(row.certificate) as unknown,
        at: row.supersededAt,
      })),
    // Sealed under AK on the device; only a device of the account opens them
    sealed: {
      keyBlock: bytesOf(keys.keyBlock),
      unlockPassphrase: bytesOf(keys.unlockPassphrase),
      unlockRecovery: bytesOf(keys.unlockRecovery),
      state: bytesOf(keys.state),
      stateCounter: keys.stateCounter,
    },
    updatedAt: keys.updatedAt,
  };
};

/** Devices with their sessions: names, times, address and browser, never a token */
const devicesOf = (db: Db, id: string) =>
  db
    .select({
      deviceId: deviceSessions.deviceId,
      name: deviceSessions.name,
      createdAt: deviceSessions.createdAt,
      lastSeenAt: deviceSessions.lastSeenAt,
      ipAddress: authSession.ipAddress,
      userAgent: authSession.userAgent,
      expiresAt: authSession.expiresAt,
    })
    .from(deviceSessions)
    .innerJoin(authSession, eq(authSession.id, deviceSessions.sessionId))
    .where(eq(deviceSessions.accountId, id))
    .all()
    .map((row) => ({ ...row, expiresAt: row.expiresAt.getTime() }));

const passkeysOf = (db: Db, id: string) =>
  db
    .select()
    .from(authPasskey)
    .where(eq(authPasskey.userId, id))
    .all()
    .map((row) => ({
      name: row.name,
      credentialId: row.credentialID,
      deviceType: row.deviceType,
      backedUp: row.backedUp,
      aaguid: row.aaguid,
      createdAt: row.createdAt?.getTime() ?? null,
    }));

const notificationsOf = (db: Db, id: string) => ({
  items: db
    .select()
    .from(notifications)
    .where(eq(notifications.accountId, id))
    .orderBy(asc(notifications.createdAt))
    .all()
    .map(({ companyId: _, accountId: __, ...row }) => row),
  prefs: (() => {
    const row = db
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.accountId, id))
      .get();
    return row ? (JSON.parse(row.prefs) as unknown) : null;
  })(),
  pushSubscriptions: db
    .select({ endpoint: pushSubscriptions.endpoint, createdAt: pushSubscriptions.createdAt })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, id))
    .all(),
});

/** The vaults whose log names the account, with its role; contents only through the app's export */
const vaultsOf = (db: Db, companyId: string, id: string) =>
  db
    .select({ id: vaults.id, createdAt: vaults.createdAt, createdBy: vaults.createdBy })
    .from(vaults)
    .where(eq(vaults.companyId, companyId))
    .all()
    .flatMap((vault) => {
      const member = membersOf(storedEntries(db, vault.id)).get(id);
      return member
        ? [
            {
              id: vault.id,
              createdAt: vault.createdAt,
              createdByMe: vault.createdBy === id,
              role: member.role,
              validUntil: member.validUntil,
            },
          ]
        : [];
    });

/** The other side of an emergency grant, to keep both sides in the company */
const grantees = alias(accounts, "grantees");

/** Groups, requests, shares, emergency access, links and invitations: IDs and times only */
const relationsOf = (db: Db, companyId: string, id: string) => ({
  groups: db
    .select({ id: groups.id, name: groups.name, viaIdp: groupMembers.viaIdp })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.accountId, id), eq(groups.companyId, companyId)))
    .all(),
  vaultRequests: db
    .select({ vaultId: vaultRequests.vaultId, requestedAt: vaultRequests.requestedAt })
    .from(vaultRequests)
    .innerJoin(vaults, eq(vaults.id, vaultRequests.vaultId))
    .where(and(eq(vaults.companyId, companyId), eq(vaultRequests.accountId, id)))
    .all(),
  shares: db
    .select({
      vaultId: entryShares.vaultId,
      entryId: entryShares.entryId,
      recipient: entryShares.recipient,
      sharer: entryShares.sharer,
      validUntil: entryShares.validUntil,
      time: entryShares.time,
    })
    .from(entryShares)
    .innerJoin(vaults, eq(vaults.id, entryShares.vaultId))
    .where(
      and(
        eq(vaults.companyId, companyId),
        or(eq(entryShares.recipient, id), eq(entryShares.sharer, id)),
      ),
    )
    .all(),
  emergency: db
    .select({
      grantor: emergencyGrants.grantor,
      grantee: emergencyGrants.grantee,
      time: emergencyGrants.time,
      requestedAt: emergencyGrants.requestedAt,
      releasedAt: emergencyGrants.releasedAt,
    })
    .from(emergencyGrants)
    .innerJoin(accounts, eq(accounts.id, emergencyGrants.grantor))
    .innerJoin(grantees, eq(grantees.id, emergencyGrants.grantee))
    .where(
      and(
        eq(accounts.companyId, companyId),
        eq(grantees.companyId, companyId),
        or(eq(emergencyGrants.grantor, id), eq(emergencyGrants.grantee, id)),
      ),
    )
    .all(),
  oneTimeLinks: db
    .select({
      id: oneTimeLinks.id,
      createdAt: oneTimeLinks.createdAt,
      expiresAt: oneTimeLinks.expiresAt,
      maxFetches: oneTimeLinks.maxFetches,
      remaining: oneTimeLinks.remaining,
    })
    .from(oneTimeLinks)
    .where(and(eq(oneTimeLinks.companyId, companyId), eq(oneTimeLinks.createdBy, id)))
    .all(),
  invitations: db
    .select({
      id: invitations.id,
      label: invitations.label,
      createdBy: invitations.createdBy,
      accountId: invitations.accountId,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.companyId, companyId),
        or(eq(invitations.createdBy, id), eq(invitations.accountId, id)),
      ),
    )
    .all(),
});

/** What the account did or what was done to it, as the company's audit chain names it */
const auditOf = (db: Db, companyId: string, id: string) =>
  db
    .select({
      seq: auditEvents.seq,
      time: auditEvents.time,
      actor: auditEvents.actor,
      action: auditEvents.action,
      subject: auditEvents.subject,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.companyId, companyId),
        or(eq(auditEvents.actor, id), eq(auditEvents.subject, id)),
      ),
    )
    .orderBy(asc(auditEvents.seq))
    .all();

/** Everything the server keeps about one account of one company */
export const privacyExport = (db: Db, companyId: string, id: string, at: number) => {
  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.companyId, companyId), isNull(accounts.leftAt)))
    .get();
  if (!account) return undefined;
  const oidc = db.select().from(oidcIdentities).where(eq(oidcIdentities.accountId, id)).get();
  return {
    format: "kennwort-privacy-export",
    version: PRIVACY_EXPORT_VERSION,
    exportedAt: at,
    account: {
      id: account.id,
      companyId: account.companyId,
      role: account.role,
      createdAt: account.createdAt,
    },
    keys: keysOf(db, id),
    devices: devicesOf(db, id),
    passkeys: passkeysOf(db, id),
    identityProvider: oidc
      ? { issuer: oidc.issuer, subject: oidc.subject, name: oidc.name, linkedAt: oidc.linkedAt }
      : null,
    recoveryDeposit:
      db
        .select({ storedAt: recoveryDeposits.storedAt })
        .from(recoveryDeposits)
        .where(eq(recoveryDeposits.accountId, id))
        .get() ?? null,
    failedSignIns: db
      .select({ at: loginFailures.at })
      .from(loginFailures)
      .where(eq(loginFailures.accountId, id))
      .all()
      .map((row) => row.at),
    notifications: notificationsOf(db, id),
    vaults: vaultsOf(db, companyId, id),
    ...relationsOf(db, companyId, id),
    audit: auditOf(db, companyId, id),
    // The entries themselves: only a device opens them, in the app's export (K-504)
    entries: { export: "/export" },
  };
};

export const privacyRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>().get("/account/export", (c) => {
    const { accountId, companyId } = c.var.session;
    const data = privacyExport(db, companyId, accountId, now());
    if (!data) return c.json({ error: "not-found" }, 404);
    // A download, never cached on the way
    c.header("Cache-Control", "no-store");
    return c.json(data);
  });
