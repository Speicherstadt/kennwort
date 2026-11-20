/**
 * Adding a device (docs/sicherheitsdesign.md, P-04). The new device announces a one-time X-Wing
 * public key and gets a poll token; an unlocked device of an account loads that key (checking it
 * against the fingerprint in the QR code), answers with the wrapped package and, once both devices
 * show the same comparison code, confirms. Only then does the new device's poll return a session
 * for that account. The server sees public keys and a package it cannot open; it keeps only a hash
 * of the poll token, and a pairing lasts ten minutes.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { bytes, encodeBytes } from "@kennwort/core";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { pairings } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { Auth } from "./better-auth.ts";
import type { ClientAddress, ClientEnv } from "./client-address.ts";

export const PAIRING_MS = 10 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// An X-Wing public key (F-02)
const Announce = z.object({ publicKey: bytes(1216) });
const Poll = z.object({ pollToken: z.string().min(1).max(128) });
const Answer = z.object({ package: bytes() });

export type PairingDeps = {
  db: Db;
  auth: Auth;
  now: () => number;
  random: (length: number) => Uint8Array;
  allow: (key: string) => boolean;
  address: ClientAddress;
};

/** The pairing behind an ID and a poll token, while it lasts */
const byPollToken = (db: Db, id: string, token: string, at: number) => {
  const row = db
    .select()
    .from(pairings)
    .where(and(eq(pairings.id, id), gt(pairings.expiresAt, at)))
    .get();
  return row && sameHash(row.pollHash, hashToken(token)) ? row : undefined;
};

/** Public: the new device announces itself, polls and may cancel; the poll token is its proof */
export const pairingPublicRoutes = ({ db, auth, now, random, allow, address }: PairingDeps) =>
  new Hono()
    .post("/", async (c) => {
      if (!allow(`pairing:${address(c.req.raw, c.env as ClientEnv)}`))
        return c.json({ error: "too-many-requests" }, 429);
      const parsed = Announce.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const id = encodeBytes(random(16));
      const pollToken = encodeBytes(random(32));
      db.insert(pairings)
        .values({
          id,
          publicKey: Buffer.from(parsed.data.publicKey),
          pollHash: hashToken(pollToken),
          expiresAt: now() + PAIRING_MS,
        })
        .run();
      return c.json({ id, pollToken }, 201);
    })
    .post("/:id/poll", async (c) => {
      if (!allow(`pairing-poll:${address(c.req.raw, c.env as ClientEnv)}`))
        return c.json({ error: "too-many-requests" }, 429);
      const parsed = Poll.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const row = byPollToken(db, c.req.param("id"), parsed.data.pollToken, now());
      if (!row) return c.json({ error: "unknown-pairing" }, 404);
      if (!row.package || !row.accountId) return c.json({ state: "waiting" });
      const pkg = encodeBytes(row.package);
      if (!row.confirmed) return c.json({ state: "package", package: pkg });
      // Confirmed: one session, once; the pairing is gone with it
      const taken = db.delete(pairings).where(eq(pairings.id, row.id)).returning().get();
      if (!taken) return c.json({ error: "unknown-pairing" }, 404);
      const session = await (await auth.$context).internalAdapter.createSession(row.accountId);
      return session
        ? c.json({
            state: "confirmed",
            package: pkg,
            accountId: row.accountId,
            token: session.token,
          })
        : c.json({ error: "internal" }, 500);
    })
    .post("/:id/cancel", async (c) => {
      const parsed = Poll.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const row = byPollToken(db, c.req.param("id"), parsed.data.pollToken, now());
      if (!row) return c.json({ error: "unknown-pairing" }, 404);
      db.delete(pairings).where(eq(pairings.id, row.id)).run();
      return c.json({ cancelled: true });
    });

/** For an unlocked device: load the one-time key, answer with the package, confirm the code */
export const pairingApiRoutes = ({ db, now }: Pick<PairingDeps, "db" | "now">) =>
  new Hono<TenantEnv>()
    .get("/pairings/:id", (c) => {
      const row = db
        .select()
        .from(pairings)
        .where(
          and(
            eq(pairings.id, c.req.param("id")),
            gt(pairings.expiresAt, now()),
            isNull(pairings.package),
          ),
        )
        .get();
      return row
        ? c.json({ publicKey: encodeBytes(row.publicKey) })
        : c.json({ error: "not-found" }, 404);
    })
    .put("/pairings/:id", async (c) => {
      const parsed = Answer.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      // The first answer wins; a pairing never changes hands afterwards
      const answered = db
        .update(pairings)
        .set({ accountId: c.var.session.accountId, package: Buffer.from(parsed.data.package) })
        .where(
          and(
            eq(pairings.id, c.req.param("id")),
            gt(pairings.expiresAt, now()),
            isNull(pairings.package),
          ),
        )
        .returning()
        .get();
      return answered ? c.json({ stored: true }) : c.json({ error: "not-found" }, 404);
    })
    .post("/pairings/:id/confirm", (c) => {
      const confirmed = db
        .update(pairings)
        .set({ confirmed: true })
        .where(
          and(
            eq(pairings.id, c.req.param("id")),
            eq(pairings.accountId, c.var.session.accountId),
            isNotNull(pairings.package),
            gt(pairings.expiresAt, now()),
          ),
        )
        .returning()
        .get();
      return confirmed ? c.json({ confirmed: true }) : c.json({ error: "not-found" }, 404);
    });
