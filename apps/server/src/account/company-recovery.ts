/**
 * Company recovery (K-307 part c, docs/sicherheitsdesign.md P-13). An owner's client makes the
 * recovery key, wraps it to every owner and signs a policy naming its fingerprint; the server takes
 * all three at once, only from an owner, only for exactly the current owners and only with a policy
 * the company root signed. Every account deposits its AK, signed by its own key; an owner loads a
 * member's deposit with the sealed key block and state to recover it. A new key drops every deposit
 * and grant of the old one. None of this makes the server trusted: the clients check the policy,
 * the fingerprint and the signatures themselves.
 */
import {
  bytes,
  DepositWire,
  encodeBytes,
  isSignedPolicy,
  type Policy,
  PolicyWire,
  policyToWire,
  RecoveryKeyUpload,
} from "@kennwort/core";
import { isSignedDeposit, recoveryFingerprint } from "@kennwort/crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  companies,
  recoveryDeposits,
  recoveryGrants,
} from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

type Company = typeof companies.$inferSelect;

/** Base64url text of an exact length as bytes, undefined for anything else */
export const bytesOf = (text: string | null | undefined, length: number) => {
  const parsed = bytes(length).safeParse(text);
  return parsed.success ? parsed.data : undefined;
};

const versionOf = (stored: string | null) =>
  stored ? (PolicyWire.safeParse(JSON.parse(stored)).data?.version ?? 0) : 0;

/** A policy the company root signed for this company, newer than the one the server holds */
export const freshPolicy = (company: Company | undefined, policy: Policy) => {
  const root = bytesOf(company?.rootPublicKey, 32);
  if (!company || !root) return "invalid" as const;
  if (encodeBytes(policy.companyId) !== company.id || !isSignedPolicy(root, policy))
    return "invalid" as const;
  return policy.version > versionOf(company.policy) ? undefined : ("stale" as const);
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const companyAccounts = (db: Db | Tx, companyId: string) =>
  db.select({ id: accounts.id }).from(accounts).where(eq(accounts.companyId, companyId));

/** Drops every grant and every deposit of the company's recovery key (a new key or recovery off) */
export const dropRecovery = (db: Db | Tx, companyId: string) => {
  db.delete(recoveryGrants)
    .where(inArray(recoveryGrants.accountId, companyAccounts(db, companyId)))
    .run();
  db.delete(recoveryDeposits)
    .where(inArray(recoveryDeposits.accountId, companyAccounts(db, companyId)))
    .run();
};

type Upload = z.infer<typeof RecoveryKeyUpload>;

/** The grants name exactly the company's current owners, each once */
const grantsFitOwners = (db: Db, companyId: string, grants: Upload["grants"]) => {
  const owners = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.companyId, companyId), eq(accounts.role, "owner"), isNull(accounts.leftAt)),
    )
    .all()
    .map((row) => row.id)
    .sort();
  const named = grants.map((g) => encodeBytes(g.accountId)).sort();
  return named.length === owners.length && named.every((id, i) => id === owners[i]);
};

const storeKey = (db: Db, at: number, company: Company, upload: Upload) =>
  db.transaction((tx) => {
    dropRecovery(tx, company.id);
    tx.update(companies)
      .set({
        policy: JSON.stringify(policyToWire(upload.policy)),
        recoveryPublicKey: encodeBytes(upload.publicKey),
      })
      .where(eq(companies.id, company.id))
      .run();
    for (const { accountId, grant } of upload.grants)
      tx.insert(recoveryGrants)
        .values({ accountId: encodeBytes(accountId), wrapped: Buffer.from(grant), createdAt: at })
        .run();
  });

/** PUT /api/company/recovery-key: a new recovery key with its grants and the policy naming it */
const putRecoveryKey = (db: Db, now: () => number) => async (c: Context<TenantEnv>) => {
  const { scope, session } = c.var;
  if (scope.account(session.accountId)?.role !== "owner") return c.json({ error: "forbidden" }, 403);
  const parsed = RecoveryKeyUpload.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const upload = parsed.data;
  const company = scope.company();
  const fresh = freshPolicy(company, upload.policy);
  if (fresh === "stale") return c.json({ error: "stale" }, 409);
  const recovery = upload.policy.companyRecovery;
  if (
    fresh ||
    !recovery.enabled ||
    encodeBytes(recovery.fingerprint) !== encodeBytes(recoveryFingerprint(upload.publicKey)) ||
    !grantsFitOwners(db, session.companyId, upload.grants)
  )
    return c.json({ error: "invalid" }, 400);
  storeKey(db, now(), company as Company, upload);
  scope.audit({
    time: now(),
    actor: session.accountId,
    action: "policy-changed",
    subject: String(upload.policy.version),
    signature: new Uint8Array(),
  });
  return c.json({ version: upload.policy.version });
};

/** PUT /api/account/recovery-deposit: the account's own deposit, signed by it for the key in force */
const putDeposit = (db: Db, now: () => number) => async (c: Context<TenantEnv>) => {
  const { scope, session } = c.var;
  const parsed = DepositWire.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const recoveryKey = bytesOf(scope.company()?.recoveryPublicKey, 1216);
  const keys = db
    .select()
    .from(accountKeys)
    .where(eq(accountKeys.accountId, session.accountId))
    .get();
  const companyId = bytesOf(session.companyId, 16);
  const accountId = bytesOf(session.accountId, 16);
  if (!recoveryKey || !keys || !companyId || !accountId)
    return c.json({ error: "no-recovery" }, 409);
  const place = { companyId, accountId };
  const fingerprint = recoveryFingerprint(recoveryKey);
  // The server checks what it can: a deposit by this account for the key it holds
  if (!isSignedDeposit(new Uint8Array(keys.edPublicKey), parsed.data, place, fingerprint))
    return c.json({ error: "invalid" }, 400);
  const row = {
    pkg: Buffer.from(parsed.data.pkg),
    commitment: Buffer.from(parsed.data.commitment),
    signature: Buffer.from(parsed.data.signature),
    storedAt: now(),
  };
  db.insert(recoveryDeposits)
    .values({ accountId: session.accountId, ...row })
    .onConflictDoUpdate({ target: recoveryDeposits.accountId, set: row })
    .run();
  return c.json({ stored: true });
};

const depositOf = (db: Db, accountId: string) =>
  db.select().from(recoveryDeposits).where(eq(recoveryDeposits.accountId, accountId)).get();

const depositJson = (row: typeof recoveryDeposits.$inferSelect) => ({
  pkg: encodeBytes(row.pkg),
  commitment: encodeBytes(row.commitment),
  signature: encodeBytes(row.signature),
});

/** GET /api/members/:id/recovery: an owner loads what it needs to recover a member */
const memberRecovery = (db: Db) => (c: Context<TenantEnv>) => {
  const { scope, session } = c.var;
  if (scope.account(session.accountId)?.role !== "owner") return c.json({ error: "forbidden" }, 403);
  const member = scope.account(c.req.param("id") ?? "");
  const deposit = member && member.leftAt === null ? depositOf(db, member.id) : undefined;
  const keys = deposit
    ? db.select().from(accountKeys).where(eq(accountKeys.accountId, deposit.accountId)).get()
    : undefined;
  if (!deposit || !keys) return c.json({ error: "not-found" }, 404);
  return c.json({
    deposit: depositJson(deposit),
    keyBlock: encodeBytes(keys.keyBlock),
    state: encodeBytes(keys.state),
    stateCounter: keys.stateCounter,
  });
};

/** True when this account has a deposit the server holds: an owner may recover it (pairings.ts) */
export const hasDeposit = (db: Db, accountId: string) => depositOf(db, accountId) !== undefined;

export const companyRecoveryRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>()
    .put("/company/recovery-key", putRecoveryKey(db, now))
    .get("/account/recovery-grant", (c) => {
      const grant = db
        .select()
        .from(recoveryGrants)
        .where(eq(recoveryGrants.accountId, c.var.session.accountId))
        .get();
      return grant
        ? c.json({ recoveryGrant: encodeBytes(grant.wrapped) })
        : c.json({ error: "not-found" }, 404);
    })
    .get("/account/recovery-deposit", (c) => {
      const deposit = depositOf(db, c.var.session.accountId);
      return deposit
        ? c.json({ deposit: depositJson(deposit) })
        : c.json({ error: "not-found" }, 404);
    })
    .put("/account/recovery-deposit", putDeposit(db, now))
    .get("/members/:id/recovery", memberRecovery(db));
