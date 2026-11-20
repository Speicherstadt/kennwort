/**
 * An owner creates a company (P-07) with the setup code the operator put into the server's
 * settings; one server carries many companies (docs/plan.md, Entscheidungen), so the code is the
 * operator's key to new companies, never to existing ones. The company ID and the account come from the device,
 * which also makes the root key; the server gets only IDs, the sign-in key and the salt.
 */
import { timingSafeEqual } from "node:crypto";
import { bytes, encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { companies } from "../db/schema.ts";
import type { Auth } from "./better-auth.ts";
import type { ClientAddress, ClientEnv } from "./client-address.ts";
import { enrol } from "./enrol.ts";

const id = bytes(16).transform((id) => encodeBytes(id));
const SetupRequest = z.object({
  code: z.string().max(256),
  companyId: id,
  accountId: id,
  loginPublicKey: bytes(32),
  accountSalt: bytes(16),
});

export type SetupDeps = {
  db: Db;
  auth: Auth;
  now: () => number;
  setupCode: string | undefined;
  allow: (key: string) => boolean;
  address: ClientAddress;
};

const sameCode = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const setupRoute = ({ db, auth, now, setupCode, allow, address }: SetupDeps) =>
  new Hono().post("/setup", async (c) => {
    if (!setupCode) return c.json({ error: "not-found" }, 404);
    if (!allow(`setup:${address(c.req.raw, c.env as ClientEnv)}`))
      return c.json({ error: "too-many-requests" }, 429);
    const parsed = SetupRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    if (!sameCode(parsed.data.code, setupCode)) return c.json({ error: "wrong-code" }, 401);
    const at = now();
    const { companyId, ...account } = parsed.data;
    // The company ID is the device's; one that exists already is not taken over
    const claimed = db
      .insert(companies)
      .values({ id: companyId, createdAt: at })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!claimed) return c.json({ error: "company-exists" }, 409);
    const owner = await enrol(db, auth, { ...account, companyId, role: "owner", at });
    if (!owner) {
      db.delete(companies).where(eq(companies.id, companyId)).run();
      return c.json({ error: "account-exists" }, 409);
    }
    const session = await owner.session();
    return session
      ? c.json({ accountId: owner.id, companyId, token: session.token }, 201)
      : c.json({ error: "internal" }, 500);
  });
