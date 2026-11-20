import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
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
      { id: "jonas", companyId: "weber", createdAt: 1 },
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
  return createApp({ db, log: createLog("error", () => {}), authenticate });
};

const app = setup();
const asJonas = (path: string) =>
  app.request(path, { headers: { "x-test-session": "token-jonas" } });

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
  "GET /api/accounts/:accountId": async () => {
    expect((await asJonas("/api/accounts/max")).status).toBe(404);
    expect((await asJonas("/api/accounts/anna")).status).toBe(200);
  },
};

// Every route under /api, of any method; only the session middleware itself (ALL /api/*) is no endpoint
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
const isSessionMiddleware = (route: { method: string; path: string }) =>
  route.method === "ALL" && route.path === "/api/*";
export const apiRoutes = (routes: { method: string; path: string }[]) =>
  [
    ...new Set(
      routes
        .filter((route) => isApi(route.path) && !isSessionMiddleware(route))
        .map((route) => `${route.method} ${route.path}`),
    ),
  ].sort();

describe("apiRoutes", () => {
  it("lists any-method routes and the /api root, and leaves out only the session middleware", () => {
    const routes = [
      { method: "ALL", path: "/api/*" },
      { method: "ALL", path: "/api/everything" },
      { method: "GET", path: "/api" },
      { method: "GET", path: "/apis" },
      { method: "GET", path: "/health" },
    ];
    expect(apiRoutes(routes)).toEqual(["ALL /api/everything", "GET /api"]);
  });
});

describe("tenants (K-202)", () => {
  it("has a case for every route under /api", () => {
    expect(apiRoutes(app.routes)).toEqual(Object.keys(cases).sort());
  });

  it.each(Object.keys(cases))("%s gives no data of another company", async (route) => {
    await cases[route]?.();
  });

  it.each(Object.keys(cases))("%s needs a session", async (route) => {
    const path = (route.split(" ")[1] ?? "").replace(/:\w+/g, "anna");
    expect((await app.request(path)).status).toBe(401);
    expect((await app.request(path, { headers: { "x-test-session": "forged" } })).status).toBe(401);
  });

  it("gives Müller Elektro its own data", async () => {
    const response = await app.request("/api/accounts", {
      headers: { "x-test-session": "token-max" },
    });
    expect(await response.json()).toEqual([{ id: "max", createdAt: 3 }]);
  });
});
