// A server for the sync tests: Weber Haustechnik (Jonas, Anna, Max as in packages/core's fixtures)
// and Müller Elektro (Petra); sessions are bearer tokens named after the person
import { encodeBytes, toWire } from "@kennwort/core";
import {
  anna,
  certificate,
  contextFor,
  jonas,
  logEntries,
  max,
  root,
} from "@kennwort/core/testing";
import { createApp } from "../app.ts";
import { migrate, openDatabase } from "../db/database.ts";
import { accountKeys, accounts, companies } from "../db/schema.ts";
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
      // the company root of the fixtures, so the server checks the vault's log as clients do
      { id: "weber", createdAt: 1, rootPublicKey: encodeBytes(root.publicKey) },
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
  const bundle = Buffer.alloc(1);
  db.insert(accountKeys)
    .values(
      [jonas, anna, max].map((p) => ({
        accountId: encodeBytes(p.id),
        xwingPublicKey: Buffer.from(p.xwing.publicKey),
        edPublicKey: Buffer.from(p.ed.publicKey),
        keyBlock: bundle,
        unlockPassphrase: bundle,
        unlockRecovery: bundle,
        state: bundle,
        stateCounter: 0,
        certificate: JSON.stringify(toWire(certificate(p))),
        updatedAt: 1,
      })),
    )
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
  /** Büro with its signed log (Jonas manages, Anna edits, Max reads): records are for members */
  const openBuero = async () => {
    const created = await request("/api/vaults", "t-jonas", { body: { id: vaultId } });
    for (const entry of logEntries)
      await request(`/api/vaults/${vaultId}/log`, "t-jonas", {
        body: { entry: toWire(entry), wrappedKey: encodeBytes(new Uint8Array(1194)) },
      });
    return created.status;
  };
  return { app, db, request, openBuero };
};
