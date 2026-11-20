/**
 * The audit log under /api (K-205, P-20): the export for owners, admins and auditors, and the
 * client actions a client signs itself. The server checks who may read and that a signed action
 * names the session as actor; the signature is checked by whoever verifies the chain.
 */
import { bytes, CLIENT_ACTIONS, toWire } from "@kennwort/core";
import { Hono } from "hono";
import { z } from "zod";
import type { TenantEnv } from "../tenancy/routes.ts";

const ClientEventRequest = z.object({
  action: z.enum(CLIENT_ACTIONS),
  subject: z.string().min(1).max(200),
  signature: bytes(65),
});

export const auditRoutes = ({ now }: { now: () => number }) =>
  new Hono<TenantEnv>()
    .get("/audit", (c) => {
      const me = c.var.scope.account(c.var.session.accountId);
      if (!me || (me.role !== "owner" && me.role !== "admin"))
        return c.json({ error: "forbidden" }, 403);
      return c.json({
        companyId: c.var.session.companyId,
        events: c.var.scope.auditLog().map((event) => toWire(event)),
      });
    })
    .post("/audit", async (c) => {
      const parsed = ClientEventRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const { action, subject, signature } = parsed.data;
      // A signed action happens once; the same subject again would read as a replay (P-20)
      const seen = c.var.scope
        .auditLog()
        .some((event) => event.action === action && event.subject === subject);
      if (seen) return c.json({ error: "duplicate" }, 409);
      const event = c.var.scope.audit({
        time: now(),
        actor: c.var.session.accountId,
        action,
        subject,
        signature,
      });
      return c.json({ seq: event.seq }, 201);
    });
