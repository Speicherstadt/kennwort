/**
 * The security headers on every answer of the server (docs/sicherheitsdesign.md, P-16): the web
 * app's files set their own (static-files.ts); everything else, JSON, redirects and Better Auth's
 * answers, gets the sandbox policy, so none of it runs as a page of the app's origin.
 */
import { apiHeaders } from "@kennwort/core/headers";
import type { MiddlewareHandler } from "hono";

export const securityHeaders = (secure: boolean): MiddlewareHandler => {
  const headers = Object.entries(apiHeaders({ secure }));
  return async (c, next) => {
    await next();
    if (c.res.headers.has("content-security-policy")) return;
    // A response whose headers cannot change (one passed on from a fetch) is copied first
    const response = new Response(c.res.body, c.res);
    for (const [name, value] of headers) response.headers.set(name, value);
    c.res = undefined;
    c.res = response;
  };
};
