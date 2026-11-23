/**
 * Deleting one's own account (K-607, docs/sicherheitsdesign.md P-28). The person confirms with the
 * passphrase: the device answers a challenge with the sign-in key (P-02) under the purpose
 * `delete-account`, so a stolen session alone deletes nothing. The same rules as on the device
 * (`deletionPlan`, `companyFate` in packages/core) decide: the last owner does not leave others
 * behind without one, the only manager of a vault others are in does not leave it without one.
 * Then the account leaves the company as on removal (P-11): the vaults it was in owe a removal and
 * a rotation, which the managers' clients sign; where the device could, it signed its own removal
 * first. A vault nobody else is in goes with it; the last account of a company takes the company.
 */
import { bytes, companyFate, DELETION_PURPOSE, deletionPlan, encodeBytes } from "@kennwort/core";
import { verify } from "@kennwort/crypto";
import { and, eq, gt } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { clearFailures, isLocked, recordFailure } from "../auth/limits.ts";
import type { Db } from "../db/database.ts";
import { accounts, loginChallenges, loginKeys, vaults } from "../db/schema.ts";
import { membersOf, storedEntries } from "../sync/vault-chain.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { eraseAccount, eraseCompany, eraseVault } from "./erase.ts";
import { privacyRoutes } from "./privacy-export.ts";

const CHALLENGE_MS = 2 * 60 * 1000;
const Confirmation = z.object({ challengeId: z.string().min(1).max(64), signature: bytes(65) });

export type DeletionDeps = {
  db: Db;
  now: () => number;
  random: (length: number) => Uint8Array;
};

/** What deleting would do now: the company's fate and each vault's (by the stored logs) */
const planFor = (db: Db, companyId: string, accountId: string, now: number) => {
  const companyAccounts = db.select().from(accounts).where(eq(accounts.companyId, companyId)).all();
  // A member who has left the company manages nothing and keeps no vault alive, though the log
  // names them until a manager removes them (P-11)
  const active = new Set(companyAccounts.filter((a) => a.leftAt === null).map((a) => a.id));
  const companyVaults = db
    .select({ id: vaults.id })
    .from(vaults)
    .where(eq(vaults.companyId, companyId))
    .all()
    .map(({ id }) => ({
      id,
      members: new Map([...membersOf(storedEntries(db, id))].filter(([key]) => active.has(key))),
    }));
  const company = companyFate(companyAccounts, accountId);
  return { company, vaults: deletionPlan(companyVaults, accountId, Math.floor(now / 1000)) };
};

type Plan = ReturnType<typeof planFor>;

/** Why the deletion has to wait, if it does */
const refusal = (plan: Plan) => {
  if (plan.company === "last-owner") return "last-owner" as const;
  if (plan.company !== "erase" && plan.vaults["sole-manager"].length > 0)
    return "sole-manager" as const;
  return undefined;
};

/** Takes the challenge if it is this account's, for a deletion and not expired */
const takeChallenge = (db: Db, id: string, accountId: string, at: number) =>
  db
    .delete(loginChallenges)
    .where(
      and(
        eq(loginChallenges.id, id),
        eq(loginChallenges.accountId, accountId),
        eq(loginChallenges.way, "delete"),
        gt(loginChallenges.expiresAt, at),
      ),
    )
    .returning()
    .get();

/** Whether the sign-in key signed this challenge for a deletion */
const confirmed = (db: Db, accountId: string, challenge: string, signature: Uint8Array) => {
  const key = db.select().from(loginKeys).where(eq(loginKeys.accountId, accountId)).get();
  return (
    key !== undefined &&
    verify(
      bytes(32).parse(key.publicKey),
      signature,
      DELETION_PURPOSE,
      accountId,
      bytes(32).parse(challenge),
    )
  );
};

/** The deletion itself, in one transaction */
const erase = (db: Db, companyId: string, accountId: string, plan: Plan, at: number) =>
  db.transaction((tx) => {
    if (plan.company === "erase") return eraseCompany(tx, companyId);
    for (const vaultId of plan.vaults.drop) eraseVault(tx, vaultId);
    tx.update(accounts).set({ leftAt: at }).where(eq(accounts.id, accountId)).run();
    eraseAccount(tx, accountId, true);
  });

const deleteAccount = (deps: DeletionDeps) => async (c: Context<TenantEnv>) => {
  const { db, now } = deps;
  const { session, scope } = c.var;
  const parsed = Confirmation.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const at = now();
  const { accountId, companyId } = session;
  const challenge = takeChallenge(db, parsed.data.challengeId, accountId, at);
  if (!challenge) return c.json({ error: "unknown-challenge" }, 401);
  if (isLocked(db, accountId, at)) return c.json({ error: "locked" }, 423);
  if (!confirmed(db, accountId, challenge.challenge, parsed.data.signature)) {
    recordFailure(db, accountId, at);
    return c.json({ error: "denied" }, 401);
  }
  clearFailures(db, accountId);
  const plan = planFor(db, companyId, accountId, at);
  const refused = refusal(plan);
  if (refused) return c.json({ error: refused, vaults: plan.vaults["sole-manager"] }, 409);
  if (!plan.company) return c.json({ error: "not-found" }, 404);
  erase(db, companyId, accountId, plan, at);
  // Who deleted whom: the account itself, by ID only; the chain goes with an erased company
  if (plan.company !== "erase")
    scope.audit({
      time: at,
      actor: accountId,
      action: "member-left",
      subject: accountId,
      signature: new Uint8Array(),
    });
  return c.json({ deleted: true, company: plan.company === "erase" });
};

export const deletionRoutes = (deps: DeletionDeps) =>
  new Hono<TenantEnv>()
    // What a deletion would do, before the person confirms it
    .get("/account/deletion", (c) => {
      const { accountId, companyId } = c.var.session;
      const plan = planFor(deps.db, companyId, accountId, deps.now());
      return c.json({ ...plan, refused: refusal(plan) ?? null });
    })
    // A challenge only this session's account answers, and only for a deletion
    .post("/account/deletion/challenge", (c) => {
      const { accountId } = c.var.session;
      const key = deps.db.select().from(loginKeys).where(eq(loginKeys.accountId, accountId)).get();
      if (!key) return c.json({ error: "no-keys" }, 409);
      const id = encodeBytes(deps.random(16));
      const challenge = encodeBytes(deps.random(32));
      deps.db
        .insert(loginChallenges)
        .values({ id, accountId, way: "delete", challenge, expiresAt: deps.now() + CHALLENGE_MS })
        .run();
      return c.json({ challengeId: id, challenge, accountSalt: key.accountSalt });
    })
    .delete("/account", deleteAccount(deps))
    // What the server keeps about the account, for the person to download (Art. 15 and 20 GDPR)
    .route("/", privacyRoutes(deps));
