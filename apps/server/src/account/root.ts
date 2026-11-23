/**
 * A new company root key (K-307 part f, docs/sicherheitsdesign.md P-07, F-14). An owner's client
 * signs the change with the old and the new root, certifies every member still in anew, wraps the
 * new root to every owner and admin still in and signs the next policy; the server takes all of it
 * in one transaction, only from an owner, only as the one change from the root it holds and only
 * for exactly the members, owners and admins it lists. It keeps every change, so a client that
 * missed one finds the chain from the root it pinned, and moves each old certificate into the
 * history, so the logs its keys signed still verify. None of this makes the server trusted: each
 * client takes a change only once a person confirmed it, and never a second one from an old root.
 *
 * The key block (P-01) names the pinned root as well; a client that confirmed a change writes it
 * anew under AK, which the server cannot open.
 */
import {
  bytes,
  type Certificate,
  CertificateWire,
  CLOCK_SKEW_SECONDS,
  encodeBytes,
  isCertified,
  isSignedPolicy,
  KEY_BLOCK_PURPOSE,
  keyBlockFields,
  PolicyWire,
  policyToWire,
  RootRotationWire,
  toWire,
} from "@kennwort/core";
import { isSignedRootChange, recoveryFingerprint, verify } from "@kennwort/crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  companies,
  rootChanges,
  rootGrants,
  supersededCertificates,
} from "../db/schema.ts";
import { type Notify, noNotify } from "../notifications/notify.ts";
import { companyAccounts } from "../notifications/recipients.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { bytesOf } from "./company-recovery.ts";

type Company = typeof companies.$inferSelect;
type Rotation = z.infer<typeof RootRotationWire>;
type Staying = { id: string; role: string; keys: typeof accountKeys.$inferSelect };

const same = (a: Uint8Array, b: Uint8Array) => encodeBytes(a) === encodeBytes(b);
const ids = (list: readonly { accountId: Uint8Array }[]) =>
  list.map((item) => encodeBytes(item.accountId)).sort();
const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** The company's accounts still in that hold a certificate: each needs one of the new root */
const stayingOf = (db: Db, companyId: string): Staying[] =>
  db
    .select()
    .from(accounts)
    .innerJoin(accountKeys, eq(accountKeys.accountId, accounts.id))
    .where(and(eq(accounts.companyId, companyId), isNull(accounts.leftAt)))
    .all()
    .filter((row) => row.account_keys.certificate !== null)
    .map((row) => ({ id: row.accounts.id, role: row.accounts.role, keys: row.account_keys }));

const oldCertificateOf = (staying: Staying) =>
  CertificateWire.parse(JSON.parse(staying.keys.certificate as string));

/** A certificate of the new root for this account's keys and role, later than its old one */
const fitsAccount = (newRoot: Uint8Array, companyId: string, c: Certificate, s: Staying) =>
  isCertified(newRoot, c) &&
  encodeBytes(c.companyId) === companyId &&
  same(c.xwingPublicKey, s.keys.xwingPublicKey) &&
  same(c.edPublicKey, s.keys.edPublicKey) &&
  c.role === s.role &&
  c.issuedAt > oldCertificateOf(s).issuedAt;

const policyVersionOf = (stored: string | null) =>
  stored ? (PolicyWire.safeParse(JSON.parse(stored)).data?.version ?? 0) : 0;

/** The next policy under the new root, with the recovery key the server holds and no other */
const fitsPolicy = (company: Company, newRoot: Uint8Array, rotation: Rotation) => {
  const { policy } = rotation;
  const held = bytesOf(company.recoveryPublicKey, 1216);
  const recovery = policy.companyRecovery;
  const recoveryKept = recovery.enabled
    ? held !== undefined && same(recovery.fingerprint, recoveryFingerprint(held))
    : held === undefined;
  return (
    encodeBytes(policy.companyId) === company.id &&
    isSignedPolicy(newRoot, policy) &&
    policy.version > policyVersionOf(company.policy) &&
    recoveryKept
  );
};

/** What is wrong with a rotation, if anything; "stale" when it does not start at the root held */
const refusal = (db: Db, company: Company, rotation: Rotation, nowSeconds: number) => {
  const { change } = rotation;
  const root = bytesOf(company.rootPublicKey, 32);
  if (!root || !same(change.oldRootPublicKey, root)) return "stale" as const;
  const staying = stayingOf(db, company.id);
  const byId = new Map(staying.map((s) => [s.id, s]));
  const managers = staying.filter((s) => s.role !== "member").map((s) => s.id);
  const valid =
    encodeBytes(change.companyId) === company.id &&
    Math.abs(change.time - nowSeconds) <= CLOCK_SKEW_SECONDS &&
    isSignedRootChange(change) &&
    sameIds(ids(rotation.certificates), [...byId.keys()].sort()) &&
    rotation.certificates.every((c) => {
      const account = byId.get(encodeBytes(c.accountId));
      return account !== undefined && fitsAccount(change.newRootPublicKey, company.id, c, account);
    }) &&
    sameIds(ids(rotation.grants), managers.sort()) &&
    fitsPolicy(company, change.newRootPublicKey, rotation);
  return valid ? undefined : ("invalid" as const);
};

/** The change, the new root, policy, certificates and grants at once; the old certificates kept */
const storeRotation = (db: Db, at: number, company: Company, rotation: Rotation) =>
  db.transaction((tx) => {
    const { change } = rotation;
    tx.insert(rootChanges)
      .values({ companyId: company.id, change: JSON.stringify(toWire(change)), createdAt: at })
      .run();
    tx.update(companies)
      .set({
        rootPublicKey: encodeBytes(change.newRootPublicKey),
        policy: JSON.stringify(policyToWire(rotation.policy)),
      })
      .where(eq(companies.id, company.id))
      .run();
    const accountIds = rotation.certificates.map((c) => encodeBytes(c.accountId));
    for (const keys of tx
      .select()
      .from(accountKeys)
      .where(inArray(accountKeys.accountId, accountIds))
      .all())
      tx.insert(supersededCertificates)
        .values({
          accountId: keys.accountId,
          certificate: keys.certificate as string,
          supersededAt: at,
        })
        .run();
    for (const certificate of rotation.certificates)
      tx.update(accountKeys)
        .set({ certificate: JSON.stringify(toWire(certificate)), updatedAt: at })
        .where(eq(accountKeys.accountId, encodeBytes(certificate.accountId)))
        .run();
    const all = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyId, company.id));
    tx.delete(rootGrants).where(inArray(rootGrants.accountId, all)).run();
    for (const { accountId, grant } of rotation.grants)
      tx.insert(rootGrants)
        .values({ accountId: encodeBytes(accountId), wrapped: Buffer.from(grant), createdAt: at })
        .run();
  });

const ROTATION_STATUS = { invalid: 400, stale: 409 } as const;

/** PUT /api/company/root: an owner's client replaces the company root */
const putRoot = (db: Db, now: () => number, notify: Notify) => async (c: Context<TenantEnv>) => {
  const { scope, session } = c.var;
  if (scope.account(session.accountId)?.role !== "owner")
    return c.json({ error: "forbidden" }, 403);
  const parsed = RootRotationWire.safeParse(await c.req.json().catch(() => undefined));
  const company = scope.company();
  if (!parsed.success || !company) return c.json({ error: "invalid" }, 400);
  const refused = refusal(db, company, parsed.data, Math.floor(now() / 1000));
  if (refused) return c.json({ error: refused }, ROTATION_STATUS[refused]);
  storeRotation(db, now(), company, parsed.data);
  scope.audit({
    time: now(),
    actor: session.accountId,
    action: "root-changed",
    subject: encodeBytes(parsed.data.change.newRootPublicKey),
    signature: new Uint8Array(),
  });
  // Every client takes the change only once its person confirmed it (P-07): all hear of it
  notify({
    companyId: session.companyId,
    recipients: companyAccounts(db, session.companyId),
    kind: "root-changed",
    actor: session.accountId,
  });
  return c.json({ changed: true });
};

// A sealed key block: version, nonce, three 32-byte keys each with its length, and the tag (F-01)
const SEALED_KEY_BLOCK = 1 + 24 + 3 * (4 + 32) + 16;
const KeyBlockUpdate = z.object({ keyBlock: bytes(SEALED_KEY_BLOCK), proof: bytes(65) });

/**
 * PUT /api/account/key-block: the account's key block under AK, written anew after a root change,
 * only with a signature of the account's own Ed25519 key over it: the block holds the private
 * keys, and a session alone must not replace them (key-block-proof.ts)
 */
const putKeyBlock = (db: Db, now: () => number) => async (c: Context<TenantEnv>) => {
  const parsed = KeyBlockUpdate.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const { accountId } = c.var.session;
  const keys = db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId)).get();
  if (!keys) return c.json({ error: "not-found" }, 404);
  const fields = keyBlockFields(accountId, parsed.data.keyBlock);
  if (!verify(new Uint8Array(keys.edPublicKey), parsed.data.proof, KEY_BLOCK_PURPOSE, ...fields))
    return c.json({ error: "not-proven" }, 403);
  const stored = db
    .update(accountKeys)
    .set({ keyBlock: Buffer.from(parsed.data.keyBlock), updatedAt: now() })
    .where(eq(accountKeys.accountId, c.var.session.accountId))
    .returning()
    .get();
  return stored ? c.json({ stored: true }) : c.json({ error: "not-found" }, 404);
};

export const rootRoutes = ({
  db,
  now,
  notify = noNotify,
}: {
  db: Db;
  now: () => number;
  notify?: Notify;
}) =>
  new Hono<TenantEnv>()
    .put("/company/root", putRoot(db, now, notify))
    .put("/account/key-block", putKeyBlock(db, now));
