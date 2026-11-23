/**
 * Invitation links (docs/sicherheitsdesign.md, P-08). An owner or admin creates an invitation and
 * gets a one-time token; the link carries it next to the invitation secret and the root
 * fingerprint in its fragment, which never reaches the server. The server keeps only a hash of the
 * token. Accepting creates the account in the company with its sign-in key and returns a session.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { bytes, encodeBytes } from "@kennwort/core";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { recordAudit } from "../audit/store.ts";
import type { Db } from "../db/database.ts";
import { accounts, invitations } from "../db/schema.ts";
import { type Notify, noNotify } from "../notifications/notify.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { Auth } from "./better-auth.ts";
import type { ClientAddress, ClientEnv } from "./client-address.ts";
import { startSession } from "./devices.ts";
import { enrol } from "./enrol.ts";

export const INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const AcceptRequest = z.object({
  token: z.string().min(1).max(128),
  // The device picks its account ID (16 random bytes), so it can derive its sign-in key for it first
  accountId: bytes(16).transform((id) => encodeBytes(id)),
  loginPublicKey: bytes(32),
  accountSalt: bytes(16),
});

// The creating client picks the ID, so it can seal the invitation secret to it before asking (P-08)
const InvitationRequest = z.object({
  id: bytes(16).transform((id) => encodeBytes(id)),
  // F-01 around the 32-byte secret: version, nonce, secret and tag
  sealedSecret: bytes(1 + 24 + 32 + 16),
  /** Who it is for, shown in the member list; plain text the server sees, like any account data */
  label: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((text) => !/\p{Cc}/u.test(text)),
});

export type InvitationDeps = {
  db: Db;
  auth: Auth;
  now: () => number;
  random: (length: number) => Uint8Array;
};

type AcceptDeps = InvitationDeps & {
  allow: (key: string) => boolean;
  address: ClientAddress;
  notify?: Notify;
};

/** POST /api/invitations: for owners and admins of the session's company */
export const createInvitationRoute = ({ db, now, random }: InvitationDeps) =>
  new Hono<TenantEnv>().post("/invitations", async (c) => {
    const me = c.var.scope.account(c.var.session.accountId);
    if (!me || (me.role !== "owner" && me.role !== "admin"))
      return c.json({ error: "forbidden" }, 403);
    const parsed = InvitationRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const { id, sealedSecret, label } = parsed.data;
    const token = encodeBytes(random(32));
    const expiresAt = now() + INVITATION_MS;
    const inserted = db
      .insert(invitations)
      .values({
        id,
        companyId: c.var.session.companyId,
        createdBy: me.id,
        tokenHash: hashToken(token),
        expiresAt,
        sealedSecret: Buffer.from(sealedSecret),
        label,
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!inserted) return c.json({ error: "exists" }, 409);
    c.var.scope.audit({
      time: now(),
      actor: me.id,
      action: "invitation-created",
      subject: id,
      signature: new Uint8Array(),
    });
    return c.json({ id, token, expiresAt }, 201);
  });

/** POST /auth/invitations/:id/accept: public, the token is the proof */
export const acceptInvitationRoute = ({
  db,
  auth,
  now,
  allow,
  address,
  notify = noNotify,
}: AcceptDeps) =>
  new Hono().post("/invitations/:id/accept", async (c) => {
    if (!allow(`accept:${address(c.req.raw, c.env as ClientEnv)}`))
      return c.json({ error: "too-many-requests" }, 429);
    const parsed = AcceptRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const at = now();
    const id = c.req.param("id");
    // The token first: without it, nothing about accounts is answered (review of K-203)
    const found = db.select().from(invitations).where(eq(invitations.id, id)).get();
    if (!found || !sameHash(found.tokenHash, hashToken(parsed.data.token)))
      return c.json({ error: "invalid-invitation" }, 410);
    if (db.select().from(accounts).where(eq(accounts.id, parsed.data.accountId)).get())
      return c.json({ error: "account-exists" }, 409);
    // Claimed in one statement: of two requests with the same token, only one gets past this
    const open = db
      .update(invitations)
      .set({ acceptedAt: at })
      .where(
        and(eq(invitations.id, id), isNull(invitations.acceptedAt), gt(invitations.expiresAt, at)),
      )
      .returning()
      .get();
    if (!open) return c.json({ error: "invalid-invitation" }, 410);
    const user = await enrol(
      db,
      auth,
      { ...parsed.data, companyId: open.companyId, role: "member", at },
      (tx) =>
        tx
          .update(invitations)
          .set({ acceptedAt: at, accountId: parsed.data.accountId })
          .where(eq(invitations.id, open.id))
          .run(),
    );
    // Lost a race for the same account ID: the invitation goes back, so it can be used again
    if (!user) {
      db.update(invitations).set({ acceptedAt: null }).where(eq(invitations.id, open.id)).run();
      return c.json({ error: "account-exists" }, 409);
    }
    recordAudit(db, {
      companyId: open.companyId,
      time: at,
      actor: user.id,
      action: "invitation-accepted",
      subject: open.id,
      signature: new Uint8Array(),
    });
    // Its creator checks the new member's keys and certifies them (P-08): it hears of it
    notify({
      companyId: open.companyId,
      recipients: [open.createdBy],
      kind: "invitation-accepted",
      subject: open.id,
      actor: user.id,
    });
    const session = await startSession(db, auth, user.id, c.req.raw);
    return session
      ? c.json({ accountId: user.id, token: session.token }, 201)
      : c.json({ error: "internal" }, 500);
  });
