import { encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth/better-auth.ts";
import { migrate, openDatabase } from "../db/database.ts";
import {
  accountKeys,
  accounts,
  auditEvents,
  companies,
  invitations,
  loginKeys,
  pairings,
  vaults,
} from "../db/schema.ts";
import { createLog } from "../log.ts";
import type { Session } from "./session.ts";

// Two companies on one server: Weber Haustechnik (Jonas, Anna) and Müller Elektro (Max)
const setup = () => {
  const db = openDatabase(":memory:");
  migrate(db);
  db.insert(companies)
    .values([
      { id: "weber", createdAt: 1 },
      { id: "mueller", createdAt: 2 },
    ])
    .run();
  db.insert(accounts)
    .values([
      { id: "jonas", companyId: "weber", role: "owner", createdAt: 1 },
      { id: "anna", companyId: "weber", createdAt: 2 },
      { id: "max", companyId: "mueller", createdAt: 3 },
    ])
    .run();
  const sessions: Record<string, Session> = {
    "token-jonas": { accountId: "jonas", companyId: "weber" },
    "token-max": { accountId: "max", companyId: "mueller" },
  };
  const authenticate = async (request: Request) =>
    sessions[request.headers.get("x-test-session") ?? ""];
  const origin = "http://localhost:28100";
  const auth = createAuth(db, {
    secret: "test-secret-of-at-least-thirty-two-chars",
    baseURL: origin,
    rpID: "localhost",
    origin,
  });
  const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));
  const signIn = {
    auth,
    secret: "test-secret-of-at-least-thirty-two-chars",
    now: () => 1,
    random,
    allow: () => true,
    address: () => "192.0.2.1",
  };
  return Object.assign(createApp({ db, log: createLog("error", () => {}), authenticate, signIn }), {
    db,
  });
};

const app = setup();
const maxAnsweredPairing = () =>
  app.db
    .insert(pairings)
    .values({
      id: "max-pairing",
      publicKey: Buffer.alloc(1216),
      pollHash: "x",
      accountId: "max",
      package: Buffer.alloc(8),
      expiresAt: Date.now() + 60_000,
    })
    .onConflictDoNothing()
    .run();

const asJonas = (path: string) =>
  app.request(path, { headers: { "x-test-session": "token-jonas" } });
const jonasSends = (method: string, path: string, body: unknown) =>
  app.request(path, {
    method,
    headers: { "x-test-session": "token-jonas", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const muellerVault = encodeBytes(new Uint8Array(16).fill(0xa1));
app.db.insert(vaults).values({ id: muellerVault, companyId: "mueller", createdAt: 3 }).run();

/**
 * One case per route under /api: Jonas (Weber Haustechnik) asks for what belongs to Müller Elektro.
 * A route without a case here fails the test below, so every new endpoint brings its own.
 */
const cases: Record<string, () => Promise<void>> = {
  "GET /api/company": async () => {
    expect(await (await asJonas("/api/company")).json()).toEqual({ id: "weber", createdAt: 1 });
  },
  "GET /api/accounts": async () => {
    const list = (await (await asJonas("/api/accounts")).json()) as { id: string }[];
    expect(list.map((account) => account.id).sort()).toEqual(["anna", "jonas"]);
  },
  "POST /api/invitations": async () => {
    const response = await app.request("/api/invitations", {
      method: "POST",
      headers: { "x-test-session": "token-jonas" },
    });
    const { id } = (await response.json()) as { id: string };
    expect(
      app.db
        .select()
        .from(invitations)
        .all()
        .find((row) => row.id === id)?.companyId,
    ).toBe("weber");
  },
  "GET /api/accounts/:accountId": async () => {
    expect((await asJonas("/api/accounts/max")).status).toBe(404);
    expect((await asJonas("/api/accounts/anna")).status).toBe(200);
  },
  "GET /api/account/keys": async () => {
    // Max (Müller Elektro) has uploaded keys; Jonas gets only his own, which he has not
    app.db
      .insert(accountKeys)
      .values({
        accountId: "max",
        xwingPublicKey: Buffer.alloc(1216),
        edPublicKey: Buffer.alloc(32),
        keyBlock: Buffer.alloc(8),
        unlockPassphrase: Buffer.alloc(8),
        unlockRecovery: Buffer.alloc(8),
        state: Buffer.alloc(8),
        stateCounter: 0,
        updatedAt: 1,
      })
      .run();
    expect((await asJonas("/api/account/keys")).status).toBe(404);
  },
  "PUT /api/account/keys": async () => {
    const keys = {
      xwingPublicKey: encodeBytes(new Uint8Array(1216)),
      edPublicKey: encodeBytes(new Uint8Array(32)),
      keyBlock: "AAAA",
      unlock: { passphrase: "AAAA", recovery: "AAAA" },
      recoveryLoginPublicKey: encodeBytes(new Uint8Array(32)),
      state: "AAAA",
      stateCounter: 0,
    };
    expect((await jonasSends("PUT", "/api/account/keys", keys)).status).toBe(201);
    const rows = app.db.select().from(accountKeys).all();
    expect(rows.find((row) => row.accountId === "jonas")?.stateCounter).toBe(0);
  },
  "GET /api/pairings/:id": async () => {
    // A pairing Max (Müller Elektro) answered: Jonas sees nothing of it any more
    maxAnsweredPairing();
    expect((await asJonas("/api/pairings/max-pairing")).status).toBe(404);
  },
  "PUT /api/pairings/:id": async () => {
    maxAnsweredPairing();
    expect((await jonasSends("PUT", "/api/pairings/max-pairing", { package: "AAAA" })).status).toBe(
      404,
    );
    const row = app.db.select().from(pairings).where(eq(pairings.id, "max-pairing")).get();
    expect(row?.accountId).toBe("max");
  },
  "POST /api/pairings/:id/confirm": async () => {
    maxAnsweredPairing();
    expect((await jonasSends("POST", "/api/pairings/max-pairing/confirm", {})).status).toBe(404);
    const row = app.db.select().from(pairings).where(eq(pairings.id, "max-pairing")).get();
    expect(row?.confirmed).toBe(false);
  },
  "PUT /api/account/unlock": async () => {
    // Replaces only Jonas's own sign-in keys; Max's (Müller Elektro) stay as they are
    app.db
      .insert(loginKeys)
      .values({ accountId: "max", publicKey: "max-key", accountSalt: "max-salt", createdAt: 1 })
      .onConflictDoNothing()
      .run();
    await jonasSends("PUT", "/api/account/unlock", {
      accountSalt: encodeBytes(new Uint8Array(16)),
      loginPublicKey: encodeBytes(new Uint8Array(32)),
      recoveryLoginPublicKey: encodeBytes(new Uint8Array(32)),
      unlock: { passphrase: "AAAA", recovery: "AAAA" },
    });
    const max = app.db.select().from(loginKeys).where(eq(loginKeys.accountId, "max")).get();
    expect(max?.publicKey).toBe("max-key");
  },
  "PUT /api/account/state": async () => {
    // Writes only Jonas's own state; Max's stays at counter 0
    await jonasSends("PUT", "/api/account/state", { state: "AAAA", stateCounter: 1 });
    expect(
      app.db
        .select()
        .from(accountKeys)
        .all()
        .find((row) => row.accountId === "max")?.stateCounter,
    ).toBe(0);
  },
  "GET /api/audit": async () => {
    // Jonas (owner) gets only Weber Haustechnik's chain, though Müller Elektro has one too
    app.db
      .insert(auditEvents)
      .values({
        companyId: "mueller",
        seq: 0,
        time: 1,
        actor: "max",
        action: "signed-in",
        subject: "session",
        signature: Buffer.alloc(0),
        prevHash: Buffer.alloc(32),
        hash: Buffer.alloc(32),
      })
      .run();
    const exported = (await (await asJonas("/api/audit")).json()) as {
      companyId: string;
      events: { companyId: string }[];
    };
    expect(exported.companyId).toBe("weber");
    expect(exported.events.every((event) => event.companyId === "weber")).toBe(true);
  },
  "POST /api/audit": async () => {
    const signature = encodeBytes(new Uint8Array(65).fill(1));
    const body = { action: "export", subject: "export-t", signature };
    expect((await jonasSends("POST", "/api/audit", body)).status).toBe(201);
    const rows = app.db.select().from(auditEvents).all();
    expect(rows.find((row) => row.subject === "export-t")?.companyId).toBe("weber");
  },
  "POST /api/vaults": async () => {
    // Müller Elektro's vault ID cannot be taken over; a new vault lands in Jonas's company
    expect((await jonasSends("POST", "/api/vaults", { id: muellerVault })).status).toBe(409);
    const own = encodeBytes(new Uint8Array(16).fill(0xa2));
    expect((await jonasSends("POST", "/api/vaults", { id: own })).status).toBe(201);
    expect(app.db.select().from(vaults).where(eq(vaults.id, own)).get()?.companyId).toBe("weber");
  },
  "GET /api/vaults/:vaultId/records": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/records`)).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/entries/:entryId/versions": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/entries/x/versions`)).status).toBe(404);
  },
  "PUT /api/vaults/:vaultId/records": async () => {
    expect((await jonasSends("PUT", `/api/vaults/${muellerVault}/records`, {})).status).toBe(404);
  },
  "GET /api/vaults/:vaultId/events": async () => {
    expect((await asJonas(`/api/vaults/${muellerVault}/events`)).status).toBe(404);
  },
};

// Every route at /api or below, of any method; only the session middleware itself is no endpoint
type Route = { method: string; path: string; handler: unknown };
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
export const apiRoutes = (routes: Route[], middleware: unknown) =>
  [
    ...new Set(
      routes
        .filter((route) => isApi(route.path) && route.handler !== middleware)
        .map((route) => `${route.method} ${route.path}`),
    ),
  ].sort();

describe("apiRoutes", () => {
  it("lists any-method and catch-all routes and the /api root, and leaves out only the session middleware", () => {
    const middleware = () => {};
    const endpoint = () => {};
    const routes = [
      { method: "ALL", path: "/api/*", handler: middleware },
      { method: "ALL", path: "/api/*", handler: endpoint },
      { method: "ALL", path: "/api/everything", handler: endpoint },
      { method: "GET", path: "/api", handler: endpoint },
      { method: "GET", path: "/apis", handler: endpoint },
      { method: "GET", path: "/health", handler: endpoint },
    ];
    expect(apiRoutes(routes, middleware)).toEqual([
      "ALL /api/*",
      "ALL /api/everything",
      "GET /api",
    ]);
  });
});

describe("tenants (K-202)", () => {
  it("has a case for every route under /api", () => {
    expect(apiRoutes(app.routes, app.requireSession)).toEqual(Object.keys(cases).sort());
  });

  it.each(Object.keys(cases))("%s gives no data of another company", async (route) => {
    await cases[route]?.();
  });

  it.each(Object.keys(cases))("%s needs a session", async (route) => {
    const [method = "GET", pattern = ""] = route.split(" ");
    const path = pattern.replace(/:\w+/g, "anna").replace("*", "x");
    const request = method === "ALL" ? "POST" : method;
    expect((await app.request(path, { method: request })).status).toBe(401);
    const forged = { method: request, headers: { "x-test-session": "forged" } };
    expect((await app.request(path, forged)).status).toBe(401);
  });

  it("gives Müller Elektro its own data", async () => {
    const response = await app.request("/api/accounts", {
      headers: { "x-test-session": "token-max" },
    });
    expect(await response.json()).toEqual([{ id: "max", createdAt: 3 }]);
  });
});
