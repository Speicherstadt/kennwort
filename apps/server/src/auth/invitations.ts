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
import type { Db } from "../db/database.ts";
import { accounts, invitations, loginKeys } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { Auth } from "./better-auth.ts";

export const INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const AcceptRequest = z.object({
  token: z.string().min(1).max(128),
  loginPublicKey: bytes(32),
  accountSalt: bytes(16),
});

export type InvitationDeps = {
  db: Db;
  auth: Auth;
  now: () => number;
  random: (length: number) => Uint8Array;
};

/** POST /api/invitations: for owners and admins of the session's company */
export const createInvitationRoute = ({ db, now, random }: InvitationDeps) =>
  new Hono<TenantEnv>().post("/invitations", (c) => {
    const me = c.var.scope.account(c.var.session.accountId);
    if (!me || (me.role !== "owner" && me.role !== "admin"))
      return c.json({ error: "forbidden" }, 403);
    const id = encodeBytes(random(16));
    const token = encodeBytes(random(32));
    const expiresAt = now() + INVITATION_MS;
    db.insert(invitations)
      .values({
        id,
        companyId: c.var.session.companyId,
        createdBy: me.id,
        tokenHash: hashToken(token),
        expiresAt,
      })
      .run();
    return c.json({ id, token, expiresAt }, 201);
  });

/** POST /auth/invitations/:id/accept: public, the token is the proof */
export const acceptInvitationRoute = ({ db, auth, now }: InvitationDeps) =>
  new Hono().post("/invitations/:id/accept", async (c) => {
    const parsed = AcceptRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const at = now();
    const id = c.req.param("id");
    const found = db.select().from(invitations).where(eq(invitations.id, id)).get();
    if (!found || !sameHash(found.tokenHash, hashToken(parsed.data.token)))
      return c.json({ error: "invalid-invitation" }, 410);
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
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser({
      name: "",
      email: `${encodeBytes(parsed.data.loginPublicKey)}@accounts.kennwort.invalid`,
      emailVerified: false,
      companyId: open.companyId,
    });
    db.transaction((tx) => {
      tx.insert(accounts)
        .values({ id: user.id, companyId: open.companyId, role: "member", createdAt: at })
        .run();
      tx.insert(loginKeys)
        .values({
          accountId: user.id,
          publicKey: encodeBytes(parsed.data.loginPublicKey),
          accountSalt: encodeBytes(parsed.data.accountSalt),
          createdAt: at,
        })
        .run();
      tx.update(invitations)
        .set({ acceptedAt: at, accountId: user.id })
        .where(eq(invitations.id, open.id))
        .run();
    });
    const session = await context.internalAdapter.createSession(user.id);
    return session
      ? c.json({ accountId: user.id, token: session.token }, 201)
      : c.json({ error: "internal" }, 500);
  });
