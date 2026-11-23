// K-604: a misbehaving identity provider or browser. A forged, foreign, stale or replayed login
// gets no ticket and no account; a provider that claims groups files requests and gives no vault.
import { describe, expect, it } from "bun:test";
import { encodeBytes } from "@kennwort/core";
import { accounts, oidcTickets } from "../db/schema.ts";
import type { Tamper } from "../testing/fake-idp.ts";
import { oidcWeber } from "../testing/oidc-setup.ts";
import { createBuero } from "../testing/weber-vaults.ts";

const SANDRA = { sub: "77c2-sandra", name: "Sandra Weber" };

describe("a forged or foreign ID token", () => {
  const seconds = () => Math.floor(1_800_000_000_000 / 1000);
  it.each<[string, Tamper]>([
    ["another issuer", { claims: (c) => ({ ...c, iss: "https://evil.test" }) }],
    ["another audience", { claims: (c) => ({ ...c, aud: "other-app" }) }],
    [
      "an expired token",
      { claims: (c) => ({ ...c, exp: seconds() - 3600, iat: seconds() - 3700 }) },
    ],
    ["another nonce", { claims: (c) => ({ ...c, nonce: "replayed-nonce" }) }],
    [
      "alg none",
      {
        token: (t) => `${Buffer.from('{"alg":"none"}').toString("base64url")}.${t.split(".")[1]}.`,
      },
    ],
    ["an unknown key", { header: (h) => ({ ...h, kid: "attacker" }) }],
    ["a broken signature", { token: (t) => `${t.slice(0, -4)}AAAA` }],
  ])("gets nothing with %s", async (_, tamper) => {
    const s = await oidcWeber();
    await s.openEnrolment();
    const before = s.w.o.setup.db.select().from(accounts).all().length;
    s.idp.state.tamper = tamper;
    const result = await s.login(SANDRA);
    expect(result).toMatchObject({ status: 302, ticket: null, error: "token" });
    expect(result.location.startsWith("http://localhost:28100/oidc#error=")).toBe(true);
    expect(s.w.o.setup.db.select().from(oidcTickets).all()).toEqual([]);
    expect(s.w.o.setup.db.select().from(accounts).all()).toHaveLength(before);
  });
});

describe("a callback that is not this browser's", () => {
  it("is refused without the flow's cookie or with another one (login CSRF)", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    expect((await s.login(SANDRA, { cookie: null })).error).toBe("state");
    expect((await s.login(SANDRA, { cookie: "kennwort_oidc=someone-elses" })).error).toBe("state");
  });

  it("is refused for a state of another browser's flow", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    const mine = await s.request(`/auth/oidc/start?company=${s.companyId}`);
    const myCookie = (mine.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const theirs = await s.request(`/auth/oidc/start?company=${s.companyId}`);
    const back = s.idp.authorize(new URL(theirs.headers.get("location") ?? ""), SANDRA);
    expect((await s.callback(back as URL, myCookie)).error).toBe("state");
  });

  it("is refused when replayed: the state is taken once, and the code too", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    const first = await s.login(SANDRA);
    expect(first.ticket).toBeTruthy();
    expect((await s.callback(first.back, first.cookie)).error).toBe("state");
    // The same code under a fresh flow: the provider takes each code once
    const fresh = await s.request(`/auth/oidc/start?company=${s.companyId}`);
    const cookie = (fresh.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const state = new URL(fresh.headers.get("location") ?? "").searchParams.get("state") ?? "";
    const replay = new URL(first.back);
    replay.searchParams.set("state", state);
    expect((await s.callback(replay, cookie)).error).toBe("provider");
  });

  it("is refused after ten minutes", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    const start = await s.request(`/auth/oidc/start?company=${s.companyId}`);
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const back = s.idp.authorize(new URL(start.headers.get("location") ?? ""), SANDRA);
    s.w.o.setup.clock.advance(10 * 60 * 1000 + 1);
    expect((await s.callback(back as URL, cookie)).error).toBe("state");
  });

  it("says denied when the provider sends an error instead of a code", async () => {
    const s = await oidcWeber();
    const answer = await s.request("/auth/oidc/callback?error=access_denied&state=x");
    expect(answer.headers.get("location")).toBe("http://localhost:28100/oidc#error=denied");
  });
});

describe("a provider that claims groups", () => {
  it("files a request and gives no vault: the key comes only from a manager's signed add", async () => {
    const s = await oidcWeber();
    const { vaultId } = await createBuero(s.w);
    const made = await s.request("/api/groups", { token: s.w.o.token, body: { name: "Technik" } });
    const groupId = ((await made.json()) as { id: string }).id;
    await s.request(`/api/vaults/${vaultId}/groups/${groupId}`, {
      method: "PUT",
      token: s.w.o.token,
      body: { role: "manage" },
    });
    // Anna links herself; the provider says she is in Technik, and in groups Kennwort has not
    await s.login({ sub: "anna", groups: ["Technik", "Admins", "Büro"] }, { token: s.w.annaToken });
    const anna = encodeBytes(s.w.annaId);
    const requests = await s.request(`/api/vaults/${vaultId}/requests`, { token: s.w.o.token });
    expect(await requests.json()).toEqual({
      requests: [{ accountId: anna, requestedAt: expect.any(Number), role: "manage" }],
    });
    for (const path of ["log", "keys", "records"])
      expect(
        (await s.request(`/api/vaults/${vaultId}/${path}`, { token: s.w.annaToken })).status,
      ).toBe(404);
    const listed = await s.request("/api/vaults", { token: s.w.annaToken });
    expect(((await listed.json()) as { vaults: unknown[] }).vaults).toEqual([]);
  });

  it("enrols nobody with a certificate or a role above member, whatever it claims", async () => {
    const s = await oidcWeber();
    await s.openEnrolment();
    s.idp.state.tamper = { claims: (c) => ({ ...c, role: "owner", groups: ["owner", "admin"] }) };
    const { ticket } = await s.login(SANDRA);
    const answer = await s.enrol(ticket ?? "");
    const { accountId } = (await answer.json()) as { accountId: string };
    const members = await s.request("/api/members", { token: s.w.o.token });
    const listed = (
      (await members.json()) as { members: { id: string; role: string; certificate: unknown }[] }
    ).members;
    expect(listed.find((m) => m.id === accountId)).toMatchObject({
      role: "member",
      certificate: null,
      oidc: true,
    });
  });
});
