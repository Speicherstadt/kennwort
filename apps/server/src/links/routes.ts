/**
 * One-time links (K-601, docs/sicherheitsdesign.md P-18). A member stores an F-15 ciphertext with
 * an expiry and a number of fetches and gets two random IDs: one to list and revoke the link by,
 * one for the address. Anyone with the address fetches without an account; each fetch takes one
 * from the count inside a transaction, and a link that runs out or expires is deleted. The secret
 * that opens the ciphertext stays in the address's fragment, which never reaches the server.
 *
 * What only an honest server does: count, expire and delete. A malicious one can hand the
 * ciphertext out more often or keep it; it still cannot open it (P-18, "Restrisiko").
 */
import { createHash } from "node:crypto";
import { encodeBytes, LinkCreate, LinkIdText } from "@kennwort/core";
import { and, count, desc, eq, gt, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { recordAudit } from "../audit/store.ts";
import type { ClientAddress, ClientEnv } from "../auth/client-address.ts";
import type { Db } from "../db/database.ts";
import { oneTimeLinks } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

/** Active links per account: enough for any team, a brake on filling the database */
export const MAX_ACTIVE_LINKS = 50;

export type LinkDeps = {
  db: Db;
  now: () => number;
  random: (length: number) => Uint8Array;
  allow: (key: string) => boolean;
  address: ClientAddress;
};

const fetchHash = (fetchId: string) => createHash("sha256").update(fetchId).digest("hex");

/**
 * No answer about a link is cached or tells another site where it came from. Set on each answer,
 * not as middleware: under /api a middleware would count as a route of its own (tenancy.test.ts).
 */
export const privately = (response: Response) => {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
};

const sweep = (db: Db, at: number) =>
  db.delete(oneTimeLinks).where(lte(oneTimeLinks.expiresAt, at)).run();

const audit = (
  db: Db,
  row: { companyId: string; createdBy: string; id: string },
  action: "link-created" | "link-opened" | "link-revoked",
  time: number,
) =>
  recordAudit(db, {
    companyId: row.companyId,
    time,
    actor: row.createdBy,
    action,
    subject: row.id,
    signature: new Uint8Array(),
  });

const activeOf = (db: Db, accountId: string, at: number) =>
  db
    .select({ n: count() })
    .from(oneTimeLinks)
    .where(and(eq(oneTimeLinks.createdBy, accountId), gt(oneTimeLinks.expiresAt, at)))
    .get()?.n ?? 0;

/** For members: create, list and revoke their own links */
export const linkApiRoutes = ({ db, now, random, allow }: Omit<LinkDeps, "address">) =>
  new Hono<TenantEnv>()
    .post("/links", async (c) => {
      const { accountId, companyId } = c.var.session;
      if (!allow(`link-create:${accountId}`))
        return privately(c.json({ error: "too-many-requests" }, 429));
      const parsed = LinkCreate.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return privately(c.json({ error: "invalid" }, 400));
      const at = now();
      sweep(db, at);
      if (activeOf(db, accountId, at) >= MAX_ACTIVE_LINKS)
        return privately(c.json({ error: "too-many-links" }, 409));
      const id = encodeBytes(random(16));
      const fetchId = encodeBytes(random(16));
      const { ciphertext, expiresInMs, maxFetches } = parsed.data;
      const row = {
        id,
        fetchHash: fetchHash(fetchId),
        companyId,
        createdBy: accountId,
        ciphertext: Buffer.from(ciphertext),
        createdAt: at,
        expiresAt: at + expiresInMs,
        maxFetches,
        remaining: maxFetches,
      };
      db.insert(oneTimeLinks).values(row).run();
      audit(db, row, "link-created", at);
      return privately(c.json({ id, fetchId, expiresAt: row.expiresAt }, 201));
    })
    .get("/links", (c) => {
      const at = now();
      sweep(db, at);
      const links = db
        .select({
          id: oneTimeLinks.id,
          createdAt: oneTimeLinks.createdAt,
          expiresAt: oneTimeLinks.expiresAt,
          maxFetches: oneTimeLinks.maxFetches,
          remaining: oneTimeLinks.remaining,
        })
        .from(oneTimeLinks)
        .where(eq(oneTimeLinks.createdBy, c.var.session.accountId))
        .orderBy(desc(oneTimeLinks.createdAt))
        .all();
      return privately(c.json({ links }));
    })
    .delete("/links/:id", (c) => {
      const { accountId, companyId } = c.var.session;
      const gone = db
        .delete(oneTimeLinks)
        .where(
          and(
            eq(oneTimeLinks.id, c.req.param("id")),
            eq(oneTimeLinks.createdBy, accountId),
            eq(oneTimeLinks.companyId, companyId),
          ),
        )
        .returning({ id: oneTimeLinks.id })
        .get();
      if (!gone) return privately(c.json({ error: "not-found" }, 404));
      audit(db, { id: gone.id, companyId, createdBy: accountId }, "link-revoked", now());
      return privately(c.json({ revoked: true }));
    });

/**
 * One fetch, all or nothing: the count goes down only while the link lasts and has fetches left,
 * and the fetch that takes the last one deletes it. A link that cannot be fetched any more is
 * deleted on the way. bun:sqlite runs one statement at a time, the transaction makes the pair one.
 */
const takeOne = (db: Db, hash: string, at: number) =>
  db.transaction((tx) => {
    const taken = tx
      .update(oneTimeLinks)
      .set({ remaining: sql`${oneTimeLinks.remaining} - 1` })
      .where(
        and(
          eq(oneTimeLinks.fetchHash, hash),
          gt(oneTimeLinks.remaining, 0),
          gt(oneTimeLinks.expiresAt, at),
        ),
      )
      .returning()
      .get();
    if (!taken || taken.remaining === 0)
      tx.delete(oneTimeLinks).where(eq(oneTimeLinks.fetchHash, hash)).run();
    return taken;
  });

/**
 * Public, under /auth like the pairing a new device polls (P-04): one fetch of a link by the ID in
 * its address. Unknown, malformed, expired, used up and revoked answer alike: 404 and nothing more.
 * POST, not GET: no link preview, prefetch or cache ever sends one by itself.
 */
export const linkPublicRoutes = ({ db, now, allow, address }: Omit<LinkDeps, "random">) =>
  new Hono().post("/:fetchId/open", (c) => {
    if (!allow(`link-open:${address(c.req.raw, c.env as ClientEnv)}`))
      return privately(c.json({ error: "too-many-requests" }, 429));
    const fetchId = c.req.param("fetchId");
    const at = now();
    // A malformed ID takes the same way as an unknown one, hashed and looked up
    const hash = fetchHash(LinkIdText.safeParse(fetchId).success ? fetchId : "");
    const taken = takeOne(db, hash, at);
    if (!taken) return privately(c.json({ error: "not-found" }, 404));
    audit(db, taken, "link-opened", at);
    return privately(
      c.json({
        ciphertext: encodeBytes(taken.ciphertext),
        remaining: taken.remaining,
        expiresAt: taken.expiresAt,
      }),
    );
  });
