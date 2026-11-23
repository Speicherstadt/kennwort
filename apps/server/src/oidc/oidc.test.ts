// K-604: sign-in with OpenID Connect against the fake provider; linking only by issuer and sub,
// enrolment only into a company that allows it, never a session for an existing account
import { describe, expect, it } from "bun:test";
import { encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import {
  accountKeys,
  accounts,
  auditEvents,
  companies,
  groups,
  notifications,
  oidcCompanies,
  oidcIdentities,
} from "../db/schema.ts";
import { CLIENT, ISSUER, type OidcWeber, oidcWeber } from "../testing/oidc-setup.ts";

const ANNA_IDP = { sub: "f3b1-anna", name: "Anna Weber", groups: ["Technik"] };
const SANDRA = { sub: "77c2-sandra", name: "Sandra Weber" };

const enrolled = async (s: OidcWeber, user = SANDRA) => {
  await s.openEnrolment();
  const { ticket } = await s.login(user);
  const answer = await s.enrol(ticket ?? "");
  return { answer, body: (await answer.json()) as { accountId: string; token: string } };
};

describe("starting a login", () => {
  it("sends the browser to the provider with PKCE (S256), state, nonce and a bound cookie", async () => {
    const s = await oidcWeber();
    const start = await s.request(`/auth/oidc/start?company=${s.companyId}`);
    expect(start.status).toBe(302);
    const url = new URL(start.headers.get("location") ?? "");
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    const params = Object.fromEntries(url.searchParams);
    expect(params).toEqual({
      response_type: "code",
      client_id: CLIENT,
      redirect_uri: "http://localhost:28100/auth/oidc/callback",
      scope: "openid profile groups",
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: "S256",
    });
    const cookie = start.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^kennwort_oidc=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("Path=/auth/oidc");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("names the provider for the button, and nothing else", async () => {
    const s = await oidcWeber();
    expect(await (await s.request("/auth/oidc")).json()).toEqual({ name: "Weber SSO" });
  });
});

describe("a person without an account", () => {
  it("gets nothing while the company does not allow enrolment", async () => {
    const s = await oidcWeber();
    expect((await s.login(SANDRA)).error).toBe("no-company");
    // Without a company in the address: only when exactly one company allows it
    expect((await s.login(SANDRA, { start: "/auth/oidc/start" })).error).toBe("no-company");
    await s.openEnrolment();
    expect((await s.login(SANDRA, { start: "/auth/oidc/start" })).ticket).toBeTruthy();
  });

  it("enrols as an uncertified member without a vault, linked by issuer and sub", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    const { ticket } = await s.login(SANDRA);
    const peek = await s.request("/auth/oidc/ticket", { body: { ticket } });
    // The root key comes along: the new device pins it on first use, checked by comparing codes
    const root = encodeBytes(s.w.o.company.rootPublicKey);
    expect(await peek.json()).toEqual({ kind: "enrol", name: "Sandra Weber", rootPublicKey: root });
    const answer = await s.enrol(ticket ?? "");
    expect(answer.status).toBe(201);
    const { accountId, token } = (await answer.json()) as { accountId: string; token: string };
    expect(token).toBeTruthy();
    const db = s.w.o.setup.db;
    const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
    expect(account).toMatchObject({ companyId: s.companyId, role: "member", leftAt: null });
    expect(db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId)).get()).toBe(
      undefined,
    );
    expect(
      db.select().from(oidcIdentities).where(eq(oidcIdentities.accountId, accountId)).get(),
    ).toMatchObject({ issuer: ISSUER, subject: SANDRA.sub });
    const vaults = await s.request("/api/vaults", { token });
    expect(((await vaults.json()) as { vaults: unknown[] }).vaults).toEqual([]);
    // The ticket is used up
    expect((await s.enrol(ticket ?? "")).status).toBe(410);
  });

  it("tells the owners and admins and writes the audit log", async () => {
    const s = await oidcWeber();
    const { body } = await enrolled(s);
    const db = s.w.o.setup.db;
    const told = db
      .select()
      .from(notifications)
      .all()
      .filter((n) => n.kind === "member-enrolled");
    expect(told.map((n) => [n.accountId, n.kind, n.subject])).toEqual([
      [encodeBytes(s.w.o.owner.accountId), "member-enrolled", body.accountId],
    ]);
    const audit = db
      .select()
      .from(auditEvents)
      .all()
      .map((e) => [e.action, e.actor]);
    expect(audit).toContainEqual(["oidc-enrolled", body.accountId]);
  });

  it("cannot enrol once the company closed enrolment again", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    const { ticket } = await s.login(SANDRA);
    await s.openEnrolment(false);
    expect((await s.enrol(ticket ?? "")).status).toBe(410);
  });

  it("lets only owners and admins open enrolment", async () => {
    const s = await oidcWeber();
    expect((await s.openEnrolment(true, s.w.annaToken)).status).toBe(403);
  });
});

describe("a person with an account", () => {
  it("gets no session from the provider's word, only the account's ID", async () => {
    const s = await oidcWeber();
    const { body } = await enrolled(s);
    const { ticket } = await s.login(SANDRA);
    const answer = await s.request("/auth/oidc/ticket", { body: { ticket } });
    expect(await answer.json()).toEqual({ kind: "known", accountId: body.accountId });
    expect((await s.request("/auth/oidc/ticket", { body: { ticket } })).status).toBe(410);
    // A known person's ticket never enrols a second account
    const again = await s.login(SANDRA);
    expect((await s.enrol(again.ticket ?? "")).status).toBe(410);
  });

  it("is found by issuer and sub only: the same name or email under another sub is someone else", async () => {
    const s = await oidcWeber();
    await enrolled(s);
    s.idp.state.tamper = { claims: (c) => ({ ...c, email: "sandra@weber-haustechnik.test" }) };
    const other = await s.login({ ...SANDRA, sub: "another-sub" });
    const answer = await s.request("/auth/oidc/ticket", { body: { ticket: other.ticket } });
    expect(await answer.json()).toMatchObject({ kind: "enrol", name: "Sandra Weber" });
  });

  it("links a signed-in account to its person, once, and never a person linked elsewhere", async () => {
    const s = await oidcWeber();
    const linked = await s.login(ANNA_IDP, { token: s.w.annaToken });
    expect(linked.ticket).toBeTruthy();
    const anna = encodeBytes(s.w.annaId);
    const known = await s.request("/auth/oidc/ticket", { body: { ticket: linked.ticket } });
    expect(await known.json()).toEqual({ kind: "known", accountId: anna });
    expect((await s.login(ANNA_IDP, { token: s.w.o.token })).error).toBe("linked-elsewhere");
    expect((await s.login({ sub: "other" }, { token: s.w.annaToken })).error).toBe(
      "already-linked",
    );
    const me = await s.request("/api/oidc", { token: s.w.annaToken });
    expect(await me.json()).toEqual({ name: "Weber SSO", linked: true });
    const audit = s.w.o.setup.db
      .select()
      .from(auditEvents)
      .all()
      .map((e) => e.action);
    expect(audit.filter((a) => a === "oidc-linked")).toHaveLength(1);
  });

  it("gets nothing once the account left the company", async () => {
    const s = await oidcWeber();
    await s.login(ANNA_IDP, { token: s.w.annaToken });
    const anna = encodeBytes(s.w.annaId);
    await s.request(`/api/members/${anna}`, { method: "DELETE", token: s.w.o.token });
    expect((await s.login(ANNA_IDP)).error).toBe("left");
  });
});

describe("the admin's view", () => {
  it("shows and changes only the session's company (K-202)", async () => {
    const s = await oidcWeber();
    const db = s.w.o.setup.db;
    db.insert(companies).values({ id: "mueller", createdAt: 1 }).run();
    db.insert(groups)
      .values({ id: "m-1", companyId: "mueller", name: "Lager", createdAt: 1 })
      .run();
    db.insert(oidcCompanies).values({ companyId: "mueller", enabledBy: "x", enabledAt: 1 }).run();
    const view = (await (await s.request("/api/oidc", { token: s.w.o.token })).json()) as {
      enrolment: boolean;
      groups: unknown[];
    };
    expect(view.enrolment).toBe(false);
    expect(view.groups).toEqual([]);
    await s.openEnrolment(false);
    expect(
      db
        .select()
        .from(oidcCompanies)
        .all()
        .map((row) => row.companyId),
    ).toEqual(["mueller"]);
    // A person asking for Müller's company enrols there, never into Weber's
    const asked = await s.login(SANDRA, { start: "/auth/oidc/start?company=mueller" });
    const answer = await s.enrol(asked.ticket ?? "");
    const { accountId } = (await answer.json()) as { accountId: string };
    expect(db.select().from(accounts).where(eq(accounts.id, accountId)).get()?.companyId).toBe(
      "mueller",
    );
  });

  it("shows enrolment, its address, the claim and the groups that follow it", async () => {
    const s = await oidcWeber();
    await s.request("/api/groups", { token: s.w.o.token, body: { name: "Technik" } });
    await s.openEnrolment();
    const view = await (await s.request("/api/oidc", { token: s.w.o.token })).json();
    expect(view).toEqual({
      name: "Weber SSO",
      linked: false,
      enrolment: true,
      enrolmentUrl: `http://localhost:28100/auth/oidc/start?company=${s.companyId}`,
      groupsClaim: "groups",
      groups: [{ id: expect.any(String), name: "Technik", viaIdp: 0 }],
    });
  });
});
