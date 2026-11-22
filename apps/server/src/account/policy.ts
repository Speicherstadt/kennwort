/**
 * The company policy (K-304, F-07): an owner's client signs it with the root key, the server keeps
 * the newest and hands it to every member, whose client checks it. The server takes a policy only
 * from an owner, for this company, signed by the root key it was given at setup and with a higher
 * version than the one it has; that keeps honest servers clean, the clients' check keeps the rest.
 * Company recovery (K-307 part c): a policy with recovery on must name the recovery key the server
 * holds (a new key comes with its own route); one with recovery off drops the key, its grants and
 * every deposit.
 */
import { encodeBytes, PolicyWire, policyToWire } from "@kennwort/core";
import { recoveryFingerprint } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import { companies } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { bytesOf, dropRecovery, freshPolicy } from "./company-recovery.ts";

/** The fingerprint of the recovery key the server holds, as text; empty without one */
const heldFingerprint = (stored: string | null) => {
  const key = bytesOf(stored, 1216);
  return key ? encodeBytes(recoveryFingerprint(key)) : "";
};

export const policyRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>().put("/company/policy", async (c) => {
    const { scope, session } = c.var;
    if (scope.account(session.accountId)?.role !== "owner")
      return c.json({ error: "forbidden" }, 403);
    const parsed = PolicyWire.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const policy = parsed.data;
    const company = scope.company();
    const fresh = freshPolicy(company, policy);
    if (fresh === "invalid") return c.json({ error: "invalid" }, 400);
    if (fresh === "stale") return c.json({ error: "stale" }, 409);
    const recovery = policy.companyRecovery;
    const held = heldFingerprint(company?.recoveryPublicKey ?? null);
    if (recovery.enabled && encodeBytes(recovery.fingerprint) !== held)
      return c.json({ error: "invalid" }, 400);
    db.transaction((tx) => {
      tx.update(companies)
        .set({
          policy: JSON.stringify(policyToWire(policy)),
          ...(recovery.enabled ? {} : { recoveryPublicKey: null }),
        })
        .where(eq(companies.id, session.companyId))
        .run();
      if (!recovery.enabled) dropRecovery(tx, session.companyId);
    });
    scope.audit({
      time: now(),
      actor: session.accountId,
      action: "policy-changed",
      subject: String(policy.version),
      signature: new Uint8Array(),
    });
    return c.json({ version: policy.version });
  });
