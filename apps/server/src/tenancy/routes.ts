/** The company routes under /api; each reads only through the session's company scope */
import { Hono } from "hono";
import type { CompanyScope } from "./scope.ts";
import type { Session } from "./session.ts";

export type TenantEnv = { Variables: { session: Session; scope: CompanyScope } };

const publicAccount = (row: { id: string; createdAt: number }) => ({
  id: row.id,
  createdAt: row.createdAt,
});

export const companyRoutes = () =>
  new Hono<TenantEnv>()
    .get("/company", (c) => {
      const company = c.var.scope.company();
      return company
        ? c.json({
            id: company.id,
            createdAt: company.createdAt,
            rootPublicKey: company.rootPublicKey,
            policy: company.policy ? JSON.parse(company.policy) : null,
          })
        : c.json({ error: "not-found" }, 404);
    })
    .get("/accounts", (c) => c.json(c.var.scope.accounts().map(publicAccount)))
    .get("/accounts/:accountId", (c) => {
      const account = c.var.scope.account(c.req.param("accountId"));
      return account ? c.json(publicAccount(account)) : c.json({ error: "not-found" }, 404);
    });
