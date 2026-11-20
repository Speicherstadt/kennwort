// A server for the sync tests: Weber Haustechnik (Jonas, Anna, Max as in packages/core's fixtures)
// and Müller Elektro (Petra); sessions are bearer tokens named after the person
import { encodeBytes } from "@kennwort/core";
import { anna, contextFor, jonas, max } from "@kennwort/core/testing";
import { createApp } from "../app.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import { createLog } from "../log.ts";
import type { Session } from "../tenancy/session.ts";

export const ids = {
  jonas: encodeBytes(jonas.id),
  anna: encodeBytes(anna.id),
  max: encodeBytes(max.id),
  petra: "petra-mueller-elektro0",
};
export const vaultId = encodeBytes(contextFor(jonas).ring.vaultId);

export const syncSetup = (options: { keepAliveMs?: number } = {}) => {
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
      { id: ids.jonas, companyId: "weber", role: "owner", createdAt: 1 },
      { id: ids.anna, companyId: "weber", createdAt: 1 },
      { id: ids.max, companyId: "weber", createdAt: 1 },
      { id: ids.petra, companyId: "mueller", role: "owner", createdAt: 1 },
    ])
    .run();
  const sessions: Record<string, Session> = {
    "t-jonas": { accountId: ids.jonas, companyId: "weber" },
    "t-anna": { accountId: ids.anna, companyId: "weber" },
    "t-max": { accountId: ids.max, companyId: "weber" },
    "t-petra": { accountId: ids.petra, companyId: "mueller" },
  };
  const authenticate = async (request: Request) =>
    sessions[request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""];
  let time = 1_800_000_000_000;
  const app = createApp({
    db,
    log: createLog("error", () => {}),
    authenticate,
    now: () => time++,
    ...(options.keepAliveMs ? { keepAliveMs: options.keepAliveMs } : {}),
  });
  const request = (path: string, token: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(init.body === undefined
        ? {}
        : { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) }),
    });
  return { app, db, request };
};
