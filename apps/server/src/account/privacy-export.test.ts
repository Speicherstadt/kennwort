// K-607 (Art. 15 and 20 GDPR): what the server keeps about Anna, as she downloads it; nothing of
// Jonas beyond his ID, no session token, and nothing once she has left
import { describe, expect, it } from "bun:test";
import { encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import {
  accounts,
  authSession,
  deviceSessions,
  notifications,
  pushSubscriptions,
} from "../db/schema.ts";
import { weber } from "../testing/weber-vaults.ts";

describe("the download of what the server keeps (K-607)", () => {
  it("names Anna's account, keys, devices and notifications, never a token or Jonas's rows", async () => {
    const w = await weber();
    const db = w.o.setup.db;
    const anna = encodeBytes(w.annaId);
    const jonas = encodeBytes(w.o.owner.accountId);
    const company = encodeBytes(w.o.company.companyId);
    const session = db.select().from(authSession).where(eq(authSession.userId, anna)).get();
    if (!session) throw new Error("Anna has a session");
    db.insert(deviceSessions)
      .values({
        sessionId: session.id,
        accountId: anna,
        deviceId: "laptop",
        name: "Firefox auf dem Laptop",
        createdAt: 1,
        lastSeenAt: 2,
      })
      .run();
    db.insert(pushSubscriptions)
      .values({
        endpoint: "https://push.example/anna",
        accountId: anna,
        sessionId: session.id,
        createdAt: 3,
      })
      .run();
    for (const [id, accountId] of [
      ["for-anna", anna],
      ["for-jonas", jonas],
    ] as const)
      db.insert(notifications)
        .values({ id, companyId: company, accountId, kind: "vault-added", createdAt: 4 })
        .run();
    const answer = await w.o.setup.request("/api/account/export", { token: w.annaToken });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    const data = (await answer.json()) as Record<string, unknown> & {
      devices: { name: string }[];
      notifications: { items: { id: string }[]; pushSubscriptions: unknown[] };
    };
    expect(data).toMatchObject({
      format: "kennwort-privacy-export",
      version: 1,
      account: { id: anna, companyId: company, role: "member" },
      keys: { certificate: expect.any(Object) },
      entries: { export: "/export" },
    });
    expect(data.devices.map((d) => d.name)).toEqual(["Firefox auf dem Laptop"]);
    expect(data.notifications.items.map((n) => n.id)).toEqual(["for-anna"]);
    expect(data.notifications.pushSubscriptions).toHaveLength(1);
    const text = JSON.stringify(data);
    expect(text).not.toContain(w.annaToken);
    expect(text).not.toContain(session.token);
    expect(text).not.toContain("for-jonas");
  });

  it("gives nothing to an account that has left", async () => {
    const w = await weber();
    w.o.setup.db
      .update(accounts)
      .set({ leftAt: 1 })
      .where(eq(accounts.id, encodeBytes(w.annaId)))
      .run();
    const answer = await w.o.setup.request("/api/account/export", { token: w.annaToken });
    expect(answer.status).toBe(401);
  });
});
