/**
 * The leak check's proxy (K-603, docs/sicherheitsdesign.md P-23): a member's client asks for the
 * range of a five-character SHA-1 prefix, and the server passes it on from the configured service
 * (upstream.ts). Nothing but exactly five upper-case hex characters is taken; the prefix is never
 * stored or logged (log.ts writes the path without it). The browser so talks only to its own
 * server: the web app needs no other host in its CSP, and the service sees the server's address,
 * not the person's. Turned off by the operator (KENNWORT_PWNED_URL=off), it answers 404.
 */
import { isRangePrefix } from "@kennwort/core";
import { Hono } from "hono";
import { privately } from "../links/routes.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { RangeSource } from "./upstream.ts";

export type PwnedDeps = {
  ranges: RangeSource;
  /** A rate limit per account, apart from the sign-in's */
  allow: (key: string) => boolean;
};

/** A check of 1200 passwords in ten minutes is far more than a small company has */
export const PWNED_LIMIT = { max: 1200, windowMs: 10 * 60 * 1000 };

export const pwnedRoutes = (deps: PwnedDeps | undefined) =>
  new Hono<TenantEnv>().get("/pwned/:prefix", async (c) => {
    if (!deps) return privately(c.json({ error: "leak-check-off" }, 404));
    const prefix = c.req.param("prefix");
    if (!isRangePrefix(prefix)) return privately(c.json({ error: "invalid" }, 400));
    if (!deps.allow(`pwned:${c.var.session.accountId}`))
      return privately(c.json({ error: "too-many-requests" }, 429));
    const range = await deps.ranges(prefix);
    if (range === undefined) return privately(c.json({ error: "upstream" }, 502));
    return privately(c.json({ range }));
  });
