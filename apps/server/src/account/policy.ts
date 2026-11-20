/**
 * The company policy (K-304, F-07): an owner's client signs it with the root key, the server keeps
 * the newest and hands it to every member, whose client checks it. The server takes a policy only
 * from an owner, for this company, signed by the root key it was given at setup and with a higher
 * version than the one it has; that keeps honest servers clean, the clients' check keeps the rest.
 */
import { bytes, encodeBytes, isSignedPolicy, PolicyWire, policyToWire } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import { companies } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

const versionOf = (stored: string | null) =>
  stored ? (PolicyWire.safeParse(JSON.parse(stored)).data?.version ?? 0) : 0;

export const policyRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>().put("/company/policy", async (c) => {
    const { scope, session } = c.var;
    if (scope.account(session.accountId)?.role !== "owner")
      return c.json({ error: "forbidden" }, 403);
    const parsed = PolicyWire.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const policy = parsed.data;
    const company = scope.company();
    const root = bytes(32).safeParse(company?.rootPublicKey);
    if (
      !company ||
      !root.success ||
      encodeBytes(policy.companyId) !== company.id ||
      !isSignedPolicy(root.data, policy)
    )
      return c.json({ error: "invalid" }, 400);
    if (policy.version <= versionOf(company.policy)) return c.json({ error: "stale" }, 409);
    db.update(companies)
      .set({ policy: JSON.stringify(policyToWire(policy)) })
      .where(eq(companies.id, company.id))
      .run();
    scope.audit({
      time: now(),
      actor: session.accountId,
      action: "policy-changed",
      subject: String(policy.version),
      signature: new Uint8Array(),
    });
    return c.json({ version: policy.version });
  });
