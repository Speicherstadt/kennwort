/**
 * OpenID Connect in a company (K-604, P-25), for signed-in accounts: whether this account is linked
 * to its person of the provider and how to link it; for owners and admins whether people of the
 * provider may enrol and the enrolment address.
 */
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { oidcCompanies } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { type OidcDeps, startFlow } from "./routes.ts";
import { enrolmentOpen, identityOf } from "./store.ts";

const Enrolment = z.object({ open: z.boolean() });

const isAdmin = (c: Context<TenantEnv>) => {
  const me = c.var.scope.account(c.var.session.accountId);
  return me?.role === "owner" || me?.role === "admin";
};

export const oidcApiRoutes = (deps: OidcDeps) =>
  new Hono<TenantEnv>()
    .get("/oidc", (c) => {
      const { companyId, accountId } = c.var.session;
      const own = {
        name: deps.provider.settings.name,
        linked: identityOf(deps.db, accountId) !== undefined,
      };
      if (!isAdmin(c)) return c.json(own);
      const origin = new URL(deps.publicUrl).origin;
      return c.json({
        ...own,
        enrolment: enrolmentOpen(deps.db, companyId),
        enrolmentUrl: `${origin}/auth/oidc/start?company=${encodeURIComponent(companyId)}`,
      });
    })
    .put("/oidc/enrolment", async (c) => {
      if (!isAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const parsed = Enrolment.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const { companyId, accountId } = c.var.session;
      if (parsed.data.open)
        deps.db
          .insert(oidcCompanies)
          .values({ companyId, enabledBy: accountId, enabledAt: deps.now() })
          .onConflictDoNothing()
          .run();
      else deps.db.delete(oidcCompanies).where(eq(oidcCompanies.companyId, companyId)).run();
      return c.json({ open: parsed.data.open });
    })
    // Linking starts like a login, with the cookie set on this answer; the callback links
    .post("/oidc/link", async (c) => {
      const url = await startFlow(deps, c, {
        companyId: null,
        linkAccount: c.var.session.accountId,
      });
      return url ? c.json({ url }) : c.json({ error: "provider-unreachable" }, 502);
    });
