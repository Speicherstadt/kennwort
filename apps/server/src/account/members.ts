/**
 * The company's members (K-304, P-07, P-08): every account with its role, its public keys and, once
 * an admin's client checked the invitation MAC, its certificate by the root key. The server only
 * keeps and hands out; who trusts a key checks the certificate itself. The sealed invitation secret
 * and the MAC go only to the invitation's creator, whose client alone can open the secret.
 */
import { bytes, CertificateWire, encodeBytes, toWire } from "@kennwort/core";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import { accountKeys, accounts, invitations } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

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
  return rows.map((row) => {
    const key = keys.get(row.id);
    return {
      id: row.id,
      role: row.role,
      xwingPublicKey: key ? encodeBytes(key.xwingPublicKey) : null,
      edPublicKey: key ? encodeBytes(key.edPublicKey) : null,
      certificate: key?.certificate ? JSON.parse(key.certificate) : null,
      invitation: pending(me, key, invited.get(row.id)),
    };
  });
};

const same = (a: Uint8Array, b: Uint8Array) => encodeBytes(a) === encodeBytes(b);

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
      // Only for this member, this company, its uploaded keys and the role it has
      if (
        encodeBytes(certificate.accountId) !== member.id ||
        encodeBytes(certificate.companyId) !== session.companyId ||
        certificate.role !== member.role ||
        !same(certificate.xwingPublicKey, bytes(1216).parse(encodeBytes(keys.xwingPublicKey))) ||
        !same(certificate.edPublicKey, bytes(32).parse(encodeBytes(keys.edPublicKey)))
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
    });
