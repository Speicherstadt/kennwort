/**
 * Emergency access (K-307 part d, docs/sicherheitsdesign.md P-14). A grantor stores a grant it
 * signed for a colleague, with the packages; the grantee asks for access with a request it signed;
 * the server starts the waiting time, shows the request to the grantor, who may object or approve
 * early, and hands the packages out only after the waiting time, unless the grantor objected. Every
 * step goes into the audit log. The server checks what it can (signatures by the right accounts,
 * the company, the vaults); the grantee's client checks the keys. The waiting time itself is the
 * server's word: the residual risk P-14 names.
 */
import {
  EmergencyGrant,
  encodeBytes,
  GrantUpload,
  grantToWire,
  isSignedGrant,
  isSignedStatement,
  packagesToWire,
  Statement,
  statementToWire,
} from "@kennwort/core";
import { bundleFingerprint, constantTimeEqual, type EmergencyStatement } from "@kennwort/crypto";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db } from "../db/database.ts";
import { accountKeys } from "../db/schema.ts";
import { currentEpoch, currentMembers } from "../sync/vault-chain.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import {
  emergencyStore,
  type GrantRow,
  listed,
  releaseAt,
  releaseState,
} from "./emergency-store.ts";
import { emergencyVaults } from "./emergency-vaults.ts";

type Deps = { db: Db; now: () => number };
type Env = Context<TenantEnv>;
type Upload = z.infer<typeof GrantUpload>;

const notFound = { error: "not-found" } as const;
/** A request signed this far from the server's clock is not taken: the wait would start wrong */
const SKEW_SECONDS = 300;

const keysOf = (db: Db, accountId: string) =>
  db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId)).get();

const parsed = async <T>(c: Env, schema: { safeParse: (v: unknown) => z.ZodSafeParseResult<T> }) =>
  schema.safeParse(await c.req.json().catch(() => undefined)).data;

/** The account in the path, a current colleague of the session in its company */
const colleague = (c: Env, id: string) => {
  const account = c.var.scope.account(id);
  return account && account.leftAt === null && id !== c.var.session.accountId ? account : undefined;
};

/** The grant names the session as grantor, the path's colleague as grantee and their company */
const namesParties = (c: Env, grant: EmergencyGrant, grantee: string) =>
  encodeBytes(grant.grantor) === c.var.session.accountId &&
  encodeBytes(grant.grantee) === grantee &&
  encodeBytes(grant.companyId) === c.var.session.companyId;

/** View: a package for exactly each vault named, in the company, whose current member the grantor is */
const vaultsFit = (db: Db, c: Env, upload: Upload, seconds: number) => {
  const { grant, packages } = upload;
  if (grant.scope === "full") return packages.account !== undefined && packages.vaults.length === 0;
  if (packages.account !== undefined || packages.vaults.length !== grant.items.length) return false;
  return grant.items.every((item, index) => {
    const pkg = packages.vaults[index];
    const vaultId = encodeBytes(item.vaultId);
    return (
      pkg !== undefined &&
      constantTimeEqual(pkg.vaultId, item.vaultId) &&
      pkg.epoch === item.epoch &&
      c.var.scope.vault(vaultId) !== undefined &&
      item.epoch <= currentEpoch(db, vaultId) &&
      currentMembers(db, vaultId, seconds).has(c.var.session.accountId)
    );
  });
};

/** Why the server does not store this grant; undefined when it does */
const grantRefusal = (deps: Deps, c: Env, upload: Upload, grantee: string) => {
  const { grant } = upload;
  if (!colleague(c, grantee)) return [notFound, 404] as const;
  if (!namesParties(c, grant, grantee)) return [{ error: "invalid" }, 400] as const;
  const mine = keysOf(deps.db, c.var.session.accountId);
  const theirs = keysOf(deps.db, grantee);
  if (!mine || !theirs || !isSignedGrant(new Uint8Array(mine.edPublicKey), grant))
    return [{ error: "invalid" }, 400] as const;
  // Wrapped to the grantee's bundle as the server holds it; the grantee's client checks it again
  const fingerprint = bundleFingerprint(theirs.xwingPublicKey, theirs.edPublicKey);
  if (!constantTimeEqual(fingerprint, grant.granteeFingerprint))
    return [{ error: "invalid" }, 400] as const;
  if (!vaultsFit(deps.db, c, upload, Math.floor(deps.now() / 1000)))
    return [{ error: "invalid" }, 400] as const;
  return undefined;
};

const putGrant = (deps: Deps) => async (c: Env) => {
  const grantee = c.req.param("grantee") ?? "";
  const upload = await parsed(c, GrantUpload);
  if (!upload) return c.json({ error: "invalid" }, 400);
  const refused = grantRefusal(deps, c, upload, grantee);
  if (refused) return c.json(refused[0], refused[1]);
  const store = emergencyStore(deps.db, c.var.session.companyId);
  const old = store.row(c.var.session.accountId, grantee);
  if (old && old.time >= upload.grant.time) return c.json({ error: "stale" }, 409);
  // A new grant ends a running request: requests, objections and approvals name the grant they are
  // about, so none of them answers this one (F-09)
  store.put({
    grantor: c.var.session.accountId,
    grantee,
    grant: JSON.stringify(grantToWire(upload.grant)),
    packages: JSON.stringify(packagesToWire(upload.packages)),
    time: upload.grant.time,
    request: null,
    requestedAt: null,
    objection: null,
    approval: null,
    releasedAt: null,
    storedAt: deps.now(),
  });
  audit(deps, c, "emergency-granted", grantee);
  return c.json({ stored: true });
};

const audit = (
  deps: Deps,
  c: Env,
  action:
    | "emergency-granted"
    | "emergency-revoked"
    | "emergency-requested"
    | "emergency-objected"
    | "emergency-released",
  subject: string,
) =>
  c.var.scope.audit({
    time: deps.now(),
    actor: c.var.session.accountId,
    action,
    subject,
    signature: new Uint8Array(),
  });

/** A statement of this kind naming exactly the stored grant, signed by the account given */
const signedStatement = async (
  deps: Deps,
  c: Env,
  row: GrantRow,
  kind: EmergencyStatement,
  signer: string,
) => {
  const statement = await parsed(c, Statement);
  const keys = keysOf(deps.db, signer);
  const grant = EmergencyGrant.parse(JSON.parse(row.grant));
  if (!statement || !keys) return undefined;
  return isSignedStatement(kind, new Uint8Array(keys.edPublicKey), grant, statement)
    ? statement
    : undefined;
};

const revoke = (deps: Deps) => async (c: Env) => {
  const grantee = c.req.param("grantee") ?? "";
  const store = emergencyStore(deps.db, c.var.session.companyId);
  const row = store.row(c.var.session.accountId, grantee);
  if (!row) return c.json(notFound, 404);
  const statement = await signedStatement(deps, c, row, "emergency-revocation", row.grantor);
  if (!statement || statement.at !== row.time) return c.json({ error: "invalid" }, 400);
  store.revoke(row.grantor, grantee, JSON.stringify(statementToWire(statement)), deps.now());
  audit(deps, c, "emergency-revoked", grantee);
  return c.json({ revoked: true });
};

const request = (deps: Deps) => async (c: Env) => {
  const grantor = c.req.param("grantor") ?? "";
  const store = emergencyStore(deps.db, c.var.session.companyId);
  const row = store.row(grantor, c.var.session.accountId);
  if (!row) return c.json(notFound, 404);
  const state = releaseState(row, deps.now());
  if (state === "waiting" || state === "released") return c.json({ error: "pending" }, 409);
  const statement = await signedStatement(deps, c, row, "emergency-request", row.grantee);
  const seconds = Math.floor(deps.now() / 1000);
  // A new request is later than the one before: an objection to that one stays with it
  const before = row.request === null ? -1 : Statement.parse(JSON.parse(row.request)).at;
  if (!statement || Math.abs(statement.at - seconds) > SKEW_SECONDS || statement.at <= before)
    return c.json({ error: "invalid" }, 400);
  store.update(grantor, row.grantee, {
    request: JSON.stringify(statementToWire(statement)),
    requestedAt: deps.now(),
    objection: null,
    approval: null,
    releasedAt: null,
  });
  audit(deps, c, "emergency-requested", grantor);
  const until = releaseAt({ ...row, requestedAt: deps.now() }) ?? 0;
  return c.json({ releaseAt: Math.floor(until / 1000) }, 201);
};

/** The grantor objects to the running request or approves it early, naming its time */
const answer =
  (deps: Deps, kind: "emergency-objection" | "emergency-approval") => async (c: Env) => {
    const grantee = c.req.param("grantee") ?? "";
    const store = emergencyStore(deps.db, c.var.session.companyId);
    const row = store.row(c.var.session.accountId, grantee);
    if (!row) return c.json(notFound, 404);
    if (releaseState(row, deps.now()) !== "waiting") return c.json({ error: "not-waiting" }, 409);
    const statement = await signedStatement(deps, c, row, kind, row.grantor);
    const requested = Statement.parse(JSON.parse(row.request ?? ""));
    if (!statement || statement.at !== requested.at) return c.json({ error: "invalid" }, 400);
    const text = JSON.stringify(statementToWire(statement));
    if (kind === "emergency-objection") {
      store.update(row.grantor, grantee, { objection: text });
      audit(deps, c, "emergency-objected", grantee);
    } else {
      store.update(row.grantor, grantee, { approval: text, releasedAt: deps.now() });
      audit(deps, c, "emergency-released", grantee);
    }
    return c.json({ stored: true });
  };

const RELEASE_STATUS = { none: 404, waiting: 403, objected: 409 } as const;

/** The grant to the session whose packages may come out now, or the answer why not */
const released = (deps: Deps, c: Env) => {
  const grantor = c.req.param("grantor") ?? "";
  const row = emergencyStore(deps.db, c.var.session.companyId).row(
    grantor,
    c.var.session.accountId,
  );
  const state = row ? releaseState(row, deps.now()) : "none";
  if (!row || state !== "released") return { refused: state as keyof typeof RELEASE_STATUS };
  return { row };
};

const release = (deps: Deps) => (c: Env) => {
  const found = released(deps, c);
  if (!found.row) return c.json({ error: found.refused }, RELEASE_STATUS[found.refused]);
  const { row } = found;
  if (row.releasedAt === null) {
    emergencyStore(deps.db, c.var.session.companyId).update(row.grantor, row.grantee, {
      releasedAt: deps.now(),
    });
    audit(deps, c, "emergency-released", row.grantor);
  }
  const grant = EmergencyGrant.parse(JSON.parse(row.grant));
  const keyBlock = grant.scope === "full" ? keysOf(deps.db, row.grantor)?.keyBlock : undefined;
  return c.json({
    packages: JSON.parse(row.packages),
    request: JSON.parse(row.request ?? "null"),
    approval: row.approval === null ? null : JSON.parse(row.approval),
    keyBlock: keyBlock ? encodeBytes(new Uint8Array(keyBlock)) : null,
  });
};

const vaults = (deps: Deps) => (c: Env) => {
  const found = released(deps, c);
  if (!found.row) return c.json({ error: found.refused }, RELEASE_STATUS[found.refused]);
  const grant = EmergencyGrant.parse(JSON.parse(found.row.grant));
  return c.json({ vaults: emergencyVaults(deps, c.var.scope, grant, found.row.grantor) });
};

export const emergencyRoutes = (deps: Deps) =>
  new Hono<TenantEnv>()
    .get("/emergency", (c) => {
      const me = c.var.session.accountId;
      const store = emergencyStore(deps.db, c.var.session.companyId);
      return c.json({
        given: store.given(me).map(listed),
        received: store.received(me).map(listed),
        revocations: store.revocations(me),
      });
    })
    .put("/emergency/:grantee", putGrant(deps))
    .delete("/emergency/:grantee", revoke(deps))
    .post("/emergency/:grantee/objection", answer(deps, "emergency-objection"))
    .post("/emergency/:grantee/approval", answer(deps, "emergency-approval"))
    .post("/emergency/:grantor/request", request(deps))
    .get("/emergency/:grantor/release", release(deps))
    .get("/emergency/:grantor/vaults", vaults(deps));
