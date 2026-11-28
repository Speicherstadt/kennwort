/**
 * The company's members (K-304, P-07, P-08): every account with its role, its public keys and, once
 * an admin's client checked the invitation MAC, its certificate by the root key. The server only
 * keeps and hands out; who trusts a key checks the certificate itself. The sealed invitation secret
 * and the MAC go only to the invitation's creator, whose client alone can open the secret.
 */
import {
  bytes,
  type Certificate,
  CertificateWire,
  encodeBytes,
  RECOVERY_GRANT_LENGTH,
  ROOT_GRANT_LENGTH,
  toWire,
} from "@kennwort/core";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  authSession,
  emergencyGrants,
  emergencyRevocations,
  entryShares,
  invitations,
  oidcIdentities,
  recoveryDeposits,
  recoveryGrants,
  rootGrants,
  vaultRequests,
} from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { supersededOf } from "./rekey.ts";

type KeysRow = typeof accountKeys.$inferSelect;
type InvitationRow = typeof invitations.$inferSelect;

/** What the creator needs to check a pending member: the invitation and the member's MAC */
const pending = (me: string, keys: KeysRow | undefined, invitation: InvitationRow | undefined) =>
  keys?.inviteMac && !keys.certificate && invitation?.sealedSecret && invitation.createdBy === me
    ? {
        id: invitation.id,
        sealedSecret: encodeBytes(invitation.sealedSecret),
        mac: encodeBytes(keys.inviteMac),
      }
    : null;

const membersOf = (db: Db, companyId: string, me: string) => {
  const rows = db.select().from(accounts).where(eq(accounts.companyId, companyId)).all();
  const ids = rows.map((row) => row.id);
  const keys = new Map(
    db
      .select()
      .from(accountKeys)
      .where(inArray(accountKeys.accountId, ids))
      .all()
      .map((row) => [row.accountId, row]),
  );
  const invited = new Map(
    db
      .select()
      .from(invitations)
      .where(and(eq(invitations.companyId, companyId), inArray(invitations.accountId, ids)))
      .all()
      .map((row) => [row.accountId, row]),
  );
  const previous = supersededOf(db, ids);
  // Enrolled through the identity provider (K-604): the admin's client compares a code instead
  const linked = new Map(
    db
      .select({ id: oidcIdentities.accountId, name: oidcIdentities.name })
      .from(oidcIdentities)
      .where(inArray(oidcIdentities.accountId, ids))
      .all()
      .map((row) => [row.id, row.name]),
  );
  return rows.map((row) => {
    const key = keys.get(row.id);
    return {
      id: row.id,
      role: row.role,
      // The inviter's label, else the provider's name for the person (K-604); a label, never trust
      name: invited.get(row.id)?.label ?? linked.get(row.id) ?? null,
      xwingPublicKey: key ? encodeBytes(key.xwingPublicKey) : null,
      edPublicKey: key ? encodeBytes(key.edPublicKey) : null,
      certificate: key?.certificate ? JSON.parse(key.certificate) : null,
      invitation: pending(me, key, invited.get(row.id)),
      leftAt: row.leftAt,
      previous: previous.get(row.id) ?? [],
      oidc: linked.has(row.id),
    };
  });
};

const same = (a: Uint8Array, b: Uint8Array) => encodeBytes(a) === encodeBytes(b);

/** A certificate after a renewal comes later than each of the account's earlier ones (P-12) */
const laterThanEarlier = (db: Db, accountId: string, issuedAt: number) =>
  (supersededOf(db, [accountId]).get(accountId) ?? []).every((earlier) => {
    const parsed = CertificateWire.safeParse(earlier);
    return parsed.success && parsed.data.issuedAt < issuedAt;
  });

const RoleChange = z.object({
  certificate: CertificateWire,
  rootGrant: bytes(ROOT_GRANT_LENGTH).optional(),
  /** The company recovery key for a new owner, while the company has one (K-307 part c) */
  recoveryGrant: bytes(RECOVERY_GRANT_LENGTH).optional(),
});

type Keys = typeof accountKeys.$inferSelect;
type Member = typeof accounts.$inferSelect;

/** A certificate only for this member, this company and its uploaded keys */
const fitsKeys = (certificate: Certificate, member: Member, companyId: string, keys: Keys) =>
  encodeBytes(certificate.accountId) === member.id &&
  encodeBytes(certificate.companyId) === companyId &&
  same(certificate.xwingPublicKey, keys.xwingPublicKey) &&
  same(certificate.edPublicKey, keys.edPublicKey);

/**
 * Role, certificate and root key at once; a member keeps no root key on the server. The caller is
 * checked again inside the transaction: it is an owner and never the member it changes, so one owner
 * always remains, also when two owners demote each other at the same time (review of K-304)
 */
const storeRole = (
  db: Db,
  at: number,
  callerId: string,
  member: Member,
  change: z.infer<typeof RoleChange>,
) =>
  db.transaction((tx) => {
    const caller = tx.select().from(accounts).where(eq(accounts.id, callerId)).get();
    if (caller?.role !== "owner") return false;
    tx.update(accounts)
      .set({ role: change.certificate.role })
      .where(eq(accounts.id, member.id))
      .run();
    const owners = tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.companyId, member.companyId), eq(accounts.role, "owner")))
      .all();
    if (owners.length === 0) {
      tx.rollback();
      return false;
    }
    tx.update(accountKeys)
      .set({ certificate: JSON.stringify(toWire(change.certificate)), updatedAt: at })
      .where(eq(accountKeys.accountId, member.id))
      .run();
    tx.delete(rootGrants).where(eq(rootGrants.accountId, member.id)).run();
    if (change.rootGrant)
      tx.insert(rootGrants)
        .values({ accountId: member.id, wrapped: Buffer.from(change.rootGrant), createdAt: at })
        .run();
    tx.delete(recoveryGrants).where(eq(recoveryGrants.accountId, member.id)).run();
    if (change.recoveryGrant)
      tx.insert(recoveryGrants)
        .values({ accountId: member.id, wrapped: Buffer.from(change.recoveryGrant), createdAt: at })
        .run();
    return true;
  });

/**
 * Who may remove whom from the company: owners anyone else, admins only members, nobody themselves
 * (so an owner always stays), and nobody who left already
 */
const removal = (me: Member | undefined, member: Member | undefined) => {
  if (!me || (me.role !== "owner" && me.role !== "admin")) return "forbidden" as const;
  if (!member) return "not-found" as const;
  if (member.id === me.id) return "own-account" as const;
  if (member.leftAt !== null) return "left" as const;
  return me.role === "admin" && member.role !== "member" ? ("forbidden" as const) : undefined;
};

/**
 * The account leaves the company (K-307, P-11): marked as left, every session gone, and what only it
 * could use dropped (requests, shares to it, a wrapped root or recovery key, its
 * recovery deposit, emergency access given by or to it, the open invitations it made). Its keys and certificate stay: the vault logs it signed must still verify.
 * The vaults it was in owe a removal and a key rotation, which the next manager client signs; the
 * server cannot.
 */
const leave = (db: Db, member: Member, at: number) =>
  db.transaction((tx) => {
    const id = member.id;
    tx.update(accounts).set({ leftAt: at }).where(eq(accounts.id, id)).run();
    tx.delete(authSession).where(eq(authSession.userId, id)).run();
    tx.delete(rootGrants).where(eq(rootGrants.accountId, id)).run();
    tx.delete(recoveryGrants).where(eq(recoveryGrants.accountId, id)).run();
    tx.delete(recoveryDeposits).where(eq(recoveryDeposits.accountId, id)).run();
    tx.delete(vaultRequests).where(eq(vaultRequests.accountId, id)).run();
    tx.delete(entryShares).where(eq(entryShares.recipient, id)).run();
    // Emergency access given by or to the account ends (P-14)
    for (const table of [emergencyGrants, emergencyRevocations])
      tx.delete(table)
        .where(or(eq(table.grantor, id), eq(table.grantee, id)))
        .run();
    // Nobody joins on a link they made: they know its token and secret (review of K-307)
    tx.delete(invitations)
      .where(and(eq(invitations.createdBy, id), isNull(invitations.acceptedAt)))
      .run();
  });

const REMOVAL_STATUS = { forbidden: 403, "not-found": 404, "own-account": 409, left: 409 } as const;

/** DELETE /api/members/:id: an owner or admin makes an account leave the company */
const removeMember = (db: Db, now: () => number) => (c: Context<TenantEnv>) => {
  const { scope, session } = c.var;
  const member = scope.account(c.req.param("id") ?? "");
  const refused = removal(scope.account(session.accountId), member);
  if (refused) return c.json({ error: refused }, REMOVAL_STATUS[refused]);
  const left = member as Member;
  leave(db, left, now());
  scope.audit({
    time: now(),
    actor: session.accountId,
    action: "member-left",
    subject: left.id,
    signature: new Uint8Array(),
  });
  return c.json({ left: true });
};

export const memberRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>()
    .get("/members", (c) =>
      c.json({ members: membersOf(db, c.var.session.companyId, c.var.session.accountId) }),
    )
    // An admin's client certifies a member's bundle once it checked the MAC (P-08 step 4)
    .put("/members/:id/certificate", async (c) => {
      const { scope, session } = c.var;
      const me = scope.account(session.accountId);
      if (!me || (me.role !== "owner" && me.role !== "admin"))
        return c.json({ error: "forbidden" }, 403);
      const member = scope.account(c.req.param("id"));
      if (!member) return c.json({ error: "not-found" }, 404);
      const parsed = CertificateWire.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const certificate = parsed.data;
      const keys = db.select().from(accountKeys).where(eq(accountKeys.accountId, member.id)).get();
      if (!keys) return c.json({ error: "no-keys" }, 409);
      // Only for this member, this company, its uploaded keys and the role it has, and after a
      // renewal of its keys (P-12) issued later than every certificate it had
      if (
        !fitsKeys(certificate, member, session.companyId, keys) ||
        certificate.role !== member.role ||
        !laterThanEarlier(db, member.id, certificate.issuedAt)
      )
        return c.json({ error: "invalid" }, 400);
      const stored = db
        .update(accountKeys)
        .set({
          certificate: JSON.stringify(toWire(certificate)),
          inviteMac: null,
          updatedAt: now(),
        })
        .where(and(eq(accountKeys.accountId, member.id), isNull(accountKeys.certificate)))
        .returning()
        .get();
      if (!stored) return c.json({ error: "certified" }, 409);
      scope.audit({
        time: now(),
        actor: me.id,
        action: "member-certified",
        subject: member.id,
        signature: new Uint8Array(),
      });
      return c.json({ certified: true });
    })
    // An owner gives another account a new role (K-304 part 3): a new certificate by the root, and
    // for owners and admins the root key wrapped to them. Never one's own role, so one owner stays
    .put("/members/:id/role", async (c) => {
      const { scope, session } = c.var;
      const me = scope.account(session.accountId);
      if (me?.role !== "owner") return c.json({ error: "forbidden" }, 403);
      const member = scope.account(c.req.param("id"));
      if (!member) return c.json({ error: "not-found" }, 404);
      if (member.id === me.id) return c.json({ error: "own-role" }, 409);
      const parsed = RoleChange.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const keys = db.select().from(accountKeys).where(eq(accountKeys.accountId, member.id)).get();
      if (!keys?.certificate) return c.json({ error: "not-certified" }, 409);
      const { certificate, rootGrant, recoveryGrant } = parsed.data;
      // The root key goes with an owner's or admin's role and with no other; the recovery key, while
      // the company has one, with an owner's and no other (K-307 part c)
      const recoveryKept = scope.company()?.recoveryPublicKey != null;
      if (
        !fitsKeys(certificate, member, session.companyId, keys) ||
        (certificate.role === "member") !== (rootGrant === undefined) ||
        (certificate.role === "owner" && recoveryKept) !== (recoveryGrant !== undefined)
      )
        return c.json({ error: "invalid" }, 400);
      if (!storeRole(db, now(), me.id, member, parsed.data))
        return c.json({ error: "forbidden" }, 403);
      scope.audit({
        time: now(),
        actor: me.id,
        action: "role-changed",
        subject: member.id,
        signature: new Uint8Array(),
      });
      return c.json({ role: certificate.role });
    })
    .delete("/members/:id", removeMember(db, now))
    .get("/account/root-grant", (c) => {
      const grant = db
        .select()
        .from(rootGrants)
        .where(eq(rootGrants.accountId, c.var.session.accountId))
        .get();
      return grant
        ? c.json({ rootGrant: encodeBytes(grant.wrapped) })
        : c.json({ error: "not-found" }, 404);
    });
