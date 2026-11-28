/**
 * Sign-in with OpenID Connect (K-604, docs/sicherheitsdesign.md P-25), the public part: start a
 * login (authorization code with PKCE, state, nonce and a cookie against login CSRF), take the
 * callback, check the ID token, and hand the result to the app as a one-time ticket in the
 * fragment of a redirect (P-16: a login through /auth ends in a redirect into the app).
 *
 * What the provider's word gives: for a person linked to an account, no session — the account
 * signs in and unlocks with its passphrase and Secret Key as always. For a person without an account,
 * an enrolment into a company that allows it: a new member without a certificate and without any
 * vault, whom an owner or admin certifies only after comparing the code of the new keys with the
 * person (P-07, P-08).
 */
import { bytes, encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { recordAudit } from "../audit/store.ts";
import type { Auth } from "../auth/better-auth.ts";
import type { ClientAddress, ClientEnv } from "../auth/client-address.ts";
import { startSession } from "../auth/devices.ts";
import { enrol } from "../auth/enrol.ts";
import type { Db } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import type { Log } from "../log.ts";
import { type Notify, noNotify } from "../notifications/notify.ts";
import { companyAccounts } from "../notifications/recipients.ts";
import { completeLogin } from "./callback.ts";
import type { Provider } from "./provider.ts";
import {
  accountOf,
  challengeOf,
  enrolmentCompany,
  enrolmentOpen,
  FLOW_MS,
  linkIdentity,
  peekTicket,
  randomText,
  saveFlow,
  takeTicket,
} from "./store.ts";

export const FLOW_COOKIE = "kennwort_oidc";

export type OidcDeps = {
  db: Db;
  auth: Auth;
  provider: Provider;
  /** The address people open; the callback and the app's page live under it */
  publicUrl: string;
  now: () => number;
  random: (length: number) => Uint8Array;
  allow: (key: string) => boolean;
  address: ClientAddress;
  log: Log;
  notify?: Notify;
};

export const redirectUri = (publicUrl: string) => `${new URL(publicUrl).origin}/auth/oidc/callback`;

/** Starts a flow and sets its cookie; the address to send the browser to, or undefined */
export const startFlow = async (
  deps: OidcDeps,
  c: Parameters<typeof setCookie>[0],
  target: { companyId: string | null; linkAccount: string | null },
) => {
  const flow = {
    state: randomText(deps.random),
    binding: randomText(deps.random),
    nonce: randomText(deps.random),
    verifier: randomText(deps.random),
    ...target,
  };
  const url = await deps.provider.authorizationUrl({
    redirectUri: redirectUri(deps.publicUrl),
    state: flow.state,
    nonce: flow.nonce,
    challenge: challengeOf(flow.verifier),
  });
  if (!url) return undefined;
  saveFlow(deps.db, flow, deps.now());
  setCookie(c, FLOW_COOKIE, flow.binding, {
    path: "/auth/oidc",
    httpOnly: true,
    sameSite: "Lax",
    secure: deps.publicUrl.startsWith("https:"),
    maxAge: FLOW_MS / 1000,
  });
  return url;
};

const Ticket = z.object({ ticket: z.string().min(1).max(128) });
const EnrolRequest = Ticket.extend({
  accountId: bytes(16).transform((id) => encodeBytes(id)),
  loginPublicKey: bytes(32),
  accountSalt: bytes(16),
});

/** The account of an enrolment, linked to its person, its admins told */
const finishEnrolment = async (
  deps: OidcDeps,
  request: z.infer<typeof EnrolRequest>,
  ticket: NonNullable<ReturnType<typeof takeTicket>>,
  companyId: string,
) => {
  const { db, auth } = deps;
  const at = deps.now();
  if (accountOf(db, ticket.issuer, ticket.subject)) return undefined;
  const user = await enrol(db, auth, { ...request, companyId, role: "member", at });
  if (!user) return undefined;
  // A person enrols once: of two tickets that raced past the check above, the second account
  // leaves at once and keeps no session
  if (!linkIdentity(db, user.id, ticket, at)) {
    db.update(accounts).set({ leftAt: at }).where(eq(accounts.id, user.id)).run();
    return undefined;
  }
  recordAudit(db, {
    companyId,
    time: at,
    actor: user.id,
    action: "oidc-enrolled",
    subject: user.id,
    signature: new Uint8Array(),
  });
  const notify = deps.notify ?? noNotify;
  notify({
    companyId,
    recipients: companyAccounts(db, companyId, ["owner", "admin"]),
    kind: "member-enrolled",
    subject: user.id,
    actor: user.id,
  });
  return user;
};

export const oidcPublicRoutes = (deps: OidcDeps) => {
  const { db, provider } = deps;
  const limited = (c: { req: { raw: Request }; env: unknown }, what: string) =>
    !deps.allow(`oidc-${what}:${deps.address(c.req.raw, c.env as ClientEnv)}`);
  return new Hono()
    .get("/oidc", (c) => c.json({ name: provider.settings.name }))
    .get("/oidc/start", async (c) => {
      if (limited(c, "start")) return c.json({ error: "too-many-requests" }, 429);
      const asked = c.req.query("company");
      const companyId = enrolmentCompany(db, asked) ?? null;
      const url = await startFlow(deps, c, { companyId, linkAccount: null });
      return url ? c.redirect(url, 302) : c.json({ error: "provider-unreachable" }, 502);
    })
    .get("/oidc/callback", async (c) => {
      const outcome = await completeLogin(deps, {
        code: c.req.query("code"),
        state: c.req.query("state"),
        error: c.req.query("error"),
        binding: getCookie(c, FLOW_COOKIE),
      });
      const app = `${new URL(deps.publicUrl).origin}/oidc`;
      const fragment = outcome.ok ? `ticket=${outcome.ticket}` : `error=${outcome.error}`;
      c.header("referrer-policy", "no-referrer");
      c.header("cache-control", "no-store");
      return c.redirect(`${app}#${fragment}`, 302);
    })
    .post("/oidc/ticket", async (c) => {
      if (limited(c, "ticket")) return c.json({ error: "too-many-requests" }, 429);
      const parsed = Ticket.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const ticket = peekTicket(db, parsed.data.ticket, deps.now());
      if (!ticket) return c.json({ error: "invalid-ticket" }, 410);
      // A known account: no session from the provider's word; it unlocks with its passphrase
      if (ticket.accountId) {
        takeTicket(db, parsed.data.ticket, deps.now());
        return c.json({ kind: "known", accountId: ticket.accountId });
      }
      // The company root, for the new device to pin on first use (TOFU, compared by code: P-07)
      const company = db
        .select()
        .from(companies)
        .where(eq(companies.id, ticket.companyId ?? ""))
        .get();
      return c.json({
        kind: "enrol",
        name: ticket.name,
        rootPublicKey: company?.rootPublicKey ?? null,
      });
    })
    .post("/oidc/enrol", async (c) => {
      if (limited(c, "enrol")) return c.json({ error: "too-many-requests" }, 429);
      const parsed = EnrolRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const ticket = takeTicket(db, parsed.data.ticket, deps.now());
      const companyId = ticket?.companyId;
      if (!ticket || ticket.accountId || !companyId || !enrolmentOpen(db, companyId))
        return c.json({ error: "invalid-ticket" }, 410);
      const user = await finishEnrolment(deps, parsed.data, ticket, companyId);
      if (!user) return c.json({ error: "account-exists" }, 409);
      const session = await startSession(db, deps.auth, user.id, c.req.raw);
      return session
        ? c.json({ accountId: user.id, token: session.token }, 201)
        : c.json({ error: "internal" }, 500);
    });
};
