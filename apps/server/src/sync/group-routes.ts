/**
 * Groups (K-305 part 5): owners and admins keep a company's groups and their members; a vault's
 * managers link groups to the vault with a role. With end-to-end encryption a group gives no
 * access: joining a group, or linking a group to a vault, only files access requests for the
 * vault's managers (P-05 step 4), and a manager's signed add gives the access.
 */
import { randomBytes } from "node:crypto";
import { encodeBytes } from "@kennwort/core";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { groupMembers, groups, vaultGroups, vaultRequests, vaults } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { pruneGroupRequests, vaultsOfGroup } from "./group-links.ts";
import { currentMembers } from "./vault-chain.ts";

type Deps = { db: Db; now: () => number };
const Named = z.object({ name: z.string().trim().min(1).max(100) });
const Linked = z.object({ role: z.enum(["read", "edit", "manage"]) });

const isAdmin = (c: Context<TenantEnv>) => {
  const me = c.var.scope.account(c.var.session.accountId);
  return me?.role === "owner" || me?.role === "admin";
};

const store = (deps: Deps) => {
  const { db } = deps;
  const seconds = () => Math.floor(deps.now() / 1000);
  const groupOf = (c: Context<TenantEnv>, groupId: string) =>
    db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.companyId, c.var.session.companyId)))
      .get();
  const vaultOf = (c: Context<TenantEnv>, vaultId: string) =>
    db
      .select()
      .from(vaults)
      .where(and(eq(vaults.id, vaultId), eq(vaults.companyId, c.var.session.companyId)))
      .get();
  /** Requests, filed by the group, for those of `accounts` who are no current members */
  const ask = (vaultId: string, accounts: string[], groupId: string) => {
    const members = currentMembers(db, vaultId, seconds());
    for (const accountId of accounts.filter((a) => !members.has(a)))
      db.insert(vaultRequests)
        .values({ vaultId, accountId, requestedAt: deps.now(), viaGroup: groupId })
        .onConflictDoNothing()
        .run();
  };
  const membersOfGroup = (groupId: string) =>
    db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .all()
      .map((row) => row.accountId);
  return { db, seconds, groupOf, vaultOf, ask, membersOfGroup };
};
type Store = ReturnType<typeof store>;

const companyGroups = (s: Store, companyId: string) => {
  const rows = s.db.select().from(groups).where(eq(groups.companyId, companyId)).all();
  return rows.map((group) => ({
    id: group.id,
    name: group.name,
    members: s.membersOfGroup(group.id),
  }));
};

const groupAdmin = (s: Store, deps: Deps) =>
  new Hono<TenantEnv>()
    .get("/groups", (c) => c.json({ groups: companyGroups(s, c.var.session.companyId) }))
    .post("/groups", async (c) => {
      if (!isAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const body = Named.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json({ error: "invalid" }, 400);
      const id = encodeBytes(new Uint8Array(randomBytes(16)));
      s.db
        .insert(groups)
        .values({
          id,
          companyId: c.var.session.companyId,
          name: body.data.name,
          createdAt: deps.now(),
        })
        .run();
      return c.json({ id }, 201);
    })
    .delete("/groups/:groupId", (c) => {
      if (!isAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const group = s.groupOf(c, c.req.param("groupId"));
      if (!group) return c.json({ error: "not-found" }, 404);
      const linked = vaultsOfGroup(s.db, group.id);
      s.db.transaction((tx) => {
        tx.delete(groupMembers).where(eq(groupMembers.groupId, group.id)).run();
        tx.delete(vaultGroups).where(eq(vaultGroups.groupId, group.id)).run();
        tx.delete(groups).where(eq(groups.id, group.id)).run();
      });
      // What the group filed goes with it, unless its people are in another linked group
      pruneGroupRequests(s.db, linked);
      return c.json({ ok: true });
    })
    .put("/groups/:groupId/members/:accountId", (c) => {
      if (!isAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const group = s.groupOf(c, c.req.param("groupId"));
      const account = c.var.scope.account(c.req.param("accountId"));
      if (!group || !account) return c.json({ error: "not-found" }, 404);
      s.db
        .insert(groupMembers)
        .values({ groupId: group.id, accountId: account.id })
        .onConflictDoNothing()
        .run();
      // Joining asks the managers of every vault the group is linked to
      const linked = s.db.select().from(vaultGroups).where(eq(vaultGroups.groupId, group.id)).all();
      for (const link of linked) s.ask(link.vaultId, [account.id], group.id);
      return c.json({ ok: true });
    })
    .delete("/groups/:groupId/members/:accountId", (c) => {
      if (!isAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const group = s.groupOf(c, c.req.param("groupId"));
      if (!group) return c.json({ error: "not-found" }, 404);
      const row = and(
        eq(groupMembers.groupId, group.id),
        eq(groupMembers.accountId, c.req.param("accountId")),
      );
      s.db.delete(groupMembers).where(row).run();
      pruneGroupRequests(s.db, vaultsOfGroup(s.db, group.id));
      return c.json({ ok: true });
    });

const vaultLinks = (s: Store) =>
  new Hono<TenantEnv>()
    .get("/vaults/:vaultId/groups", (c) => {
      const vaultId = c.req.param("vaultId");
      const member = currentMembers(s.db, vaultId, s.seconds()).get(c.var.session.accountId);
      if (!s.vaultOf(c, vaultId) || !member) return c.json({ error: "not-found" }, 404);
      const links = s.db.select().from(vaultGroups).where(eq(vaultGroups.vaultId, vaultId)).all();
      return c.json({ groups: links.map((link) => ({ groupId: link.groupId, role: link.role })) });
    })
    .put("/vaults/:vaultId/groups/:groupId", async (c) => {
      const vaultId = c.req.param("vaultId");
      const member = currentMembers(s.db, vaultId, s.seconds()).get(c.var.session.accountId);
      if (!s.vaultOf(c, vaultId) || !member) return c.json({ error: "not-found" }, 404);
      if (member.role !== "manage") return c.json({ error: "forbidden" }, 403);
      const group = s.groupOf(c, c.req.param("groupId"));
      if (!group) return c.json({ error: "not-found" }, 404);
      const body = Linked.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json({ error: "invalid" }, 400);
      s.db
        .insert(vaultGroups)
        .values({ vaultId, groupId: group.id, role: body.data.role })
        .onConflictDoUpdate({
          target: [vaultGroups.vaultId, vaultGroups.groupId],
          set: { role: body.data.role },
        })
        .run();
      // Linking asks for everyone in the group who is not in the vault yet
      s.ask(vaultId, s.membersOfGroup(group.id), group.id);
      return c.json({ ok: true });
    })
    .delete("/vaults/:vaultId/groups/:groupId", (c) => {
      const vaultId = c.req.param("vaultId");
      const member = currentMembers(s.db, vaultId, s.seconds()).get(c.var.session.accountId);
      if (!s.vaultOf(c, vaultId) || !member) return c.json({ error: "not-found" }, 404);
      if (member.role !== "manage") return c.json({ error: "forbidden" }, 403);
      const row = and(
        eq(vaultGroups.vaultId, vaultId),
        eq(vaultGroups.groupId, c.req.param("groupId")),
      );
      s.db.delete(vaultGroups).where(row).run();
      pruneGroupRequests(s.db, [vaultId]);
      return c.json({ ok: true });
    });

export const groupRoutes = (deps: Deps) => {
  const s = store(deps);
  return new Hono<TenantEnv>().route("/", groupAdmin(s, deps)).route("/", vaultLinks(s));
};
