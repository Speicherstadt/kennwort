/**
 * Access requests (K-305, P-05 step 4): a member of the company asks for access to a vault, its
 * current managers see the requests and decline them or add the member (log-routes.ts clears the
 * request with the add). The server never gives access itself: only a manager's signed entry does.
 */
import { LogEntryWire } from "@kennwort/core";
import { and, asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import { vaultLog, vaultRequests, vaults } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { linkedRoles } from "./group-links.ts";
import { isCurrent, membersOf } from "./vault-chain.ts";

type Deps = { db: Db; now: () => number };

const access = (deps: Deps) => {
  const { db } = deps;
  const seconds = () => Math.floor(deps.now() / 1000);
  const inCompany = (c: Context<TenantEnv>, vaultId: string) =>
    db
      .select()
      .from(vaults)
      .where(and(eq(vaults.companyId, c.var.session.companyId), eq(vaults.id, vaultId)))
      .get() !== undefined;
  /** The session's place in the vault by its stored log: undefined when not a current member */
  const memberOf = (c: Context<TenantEnv>, vaultId: string) => {
    const rows = db
      .select()
      .from(vaultLog)
      .where(eq(vaultLog.vaultId, vaultId))
      .orderBy(asc(vaultLog.seq))
      .all();
    const entries = rows.map((row) => LogEntryWire.parse(JSON.parse(row.entry)));
    const member = membersOf(entries).get(c.var.session.accountId);
    return isCurrent(member, seconds()) ? member : undefined;
  };
  const isManager = (c: Context<TenantEnv>, vaultId: string) =>
    memberOf(c, vaultId)?.role === "manage";
  return { db, seconds, inCompany, memberOf, isManager };
};

const requestRow = (vaultId: string, accountId: string) =>
  and(eq(vaultRequests.vaultId, vaultId), eq(vaultRequests.accountId, accountId));

export const requestRoutes = (deps: Deps) => {
  const a = access(deps);
  return new Hono<TenantEnv>()
    .post("/vaults/:vaultId/requests", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!a.inCompany(c, vaultId)) return c.json({ error: "not-found" }, 404);
      if (a.memberOf(c, vaultId)) return c.json({ error: "member" }, 409);
      a.db
        .insert(vaultRequests)
        .values({ vaultId, accountId: c.var.session.accountId, requestedAt: deps.now() })
        // Asking oneself outlasts what a group filed: unlinking the group no longer drops it
        .onConflictDoUpdate({
          target: [vaultRequests.vaultId, vaultRequests.accountId],
          set: { viaGroup: null },
        })
        .run();
      return c.json({ ok: true }, 201);
    })
    .get("/vaults/:vaultId/requests", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!a.inCompany(c, vaultId) || !a.memberOf(c, vaultId))
        return c.json({ error: "not-found" }, 404);
      if (!a.isManager(c, vaultId)) return c.json({ error: "forbidden" }, 403);
      const rows = a.db
        .select()
        .from(vaultRequests)
        .where(eq(vaultRequests.vaultId, vaultId))
        .orderBy(asc(vaultRequests.requestedAt))
        .all();
      const roles = linkedRoles(a.db, vaultId);
      return c.json({
        requests: rows.map((row) => ({
          accountId: row.accountId,
          requestedAt: row.requestedAt,
          role: roles.get(row.accountId) ?? null,
        })),
      });
    })
    .delete("/vaults/:vaultId/requests/:accountId", (c) => {
      const vaultId = c.req.param("vaultId");
      const accountId = c.req.param("accountId");
      if (!a.inCompany(c, vaultId)) return c.json({ error: "not-found" }, 404);
      // A manager declines; whoever asked may withdraw their own request
      const own = accountId === c.var.session.accountId;
      if (!own && !a.isManager(c, vaultId)) return c.json({ error: "forbidden" }, 403);
      a.db.delete(vaultRequests).where(requestRow(vaultId, accountId)).run();
      return c.json({ ok: true });
    });
};
