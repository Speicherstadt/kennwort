// K-307 part a (P-11): someone leaves the company. The server shuts them out at once; removing them
// from the vaults and rotating the keys is the next manager client's (dueExits in packages/core)
import { describe, expect, it } from "bun:test";
import { encodeBytes, MembersWire } from "@kennwort/core";
import { eq } from "drizzle-orm";
import {
  accounts,
  auditEvents,
  authSession,
  entryShares,
  groupMembers,
  groups,
  rootGrants,
  vaultRequests,
} from "../db/schema.ts";
import { createBuero, type Weber, weber } from "../testing/weber-vaults.ts";

const remove = (w: Weber, id: string, token = w.o.token) =>
  w.o.setup.request(`/api/members/${id}`, { method: "DELETE", token });
const anna = (w: Weber) => encodeBytes(w.annaId);
const companyOf = (w: Weber) => encodeBytes(w.o.company.companyId);

/** Sandra, a plain member of the same company, straight in the database */
const withSandra = (w: Weber) => {
  const id = encodeBytes(new Uint8Array(16).fill(0x40));
  w.o.setup.db
    .insert(accounts)
    .values({ id, companyId: companyOf(w), role: "member", createdAt: 1 })
    .run();
  return id;
};

describe("leaving the company (K-307, P-11)", () => {
  it("shuts Anna out at once: no session works, every session is gone", async () => {
    const w = await weber();
    expect((await w.o.setup.request("/api/vaults", { token: w.annaToken })).status).toBe(200);
    const answer = await remove(w, anna(w));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ left: true });
    expect((await w.o.setup.request("/api/vaults", { token: w.annaToken })).status).toBe(401);
    expect(
      w.o.setup.db
        .select()
        .from(authSession)
        .where(eq(authSession.userId, anna(w)))
        .all(),
    ).toEqual([]);
  });

  it("keeps her in the member list with the time she left, and her certificate for the logs", async () => {
    const w = await weber();
    await remove(w, anna(w));
    const listed = MembersWire.parse(
      await (await w.o.setup.request("/api/members", { token: w.o.token })).json(),
    );
    const her = listed.members.find((m) => encodeBytes(m.id) === anna(w));
    expect(her?.leftAt).toBeGreaterThan(0);
    expect(her?.certificate).not.toBeNull();
    expect(listed.members.find((m) => m.role === "owner")?.leftAt).toBeNull();
  });

  it("forgets what only she could use: requests, groups, shares to her and a root key", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const db = w.o.setup.db;
    db.insert(vaultRequests)
      .values({ vaultId, accountId: anna(w), requestedAt: 1 })
      .run();
    db.insert(groups)
      .values({ id: "g", companyId: companyOf(w), name: "Büro", createdAt: 1 })
      .run();
    db.insert(groupMembers)
      .values({ groupId: "g", accountId: anna(w) })
      .run();
    db.insert(rootGrants)
      .values({ accountId: anna(w), wrapped: Buffer.alloc(1), createdAt: 1 })
      .run();
    db.insert(entryShares)
      .values({
        vaultId,
        entryId: "e",
        recipient: anna(w),
        role: "read",
        validUntil: 0,
        commitment: Buffer.alloc(1),
        wrappedKey: Buffer.alloc(1),
        sharer: encodeBytes(w.o.owner.accountId),
        time: 1,
        signature: Buffer.alloc(1),
        storedAt: 1,
      })
      .run();
    await remove(w, anna(w));
    expect(db.select().from(vaultRequests).all()).toEqual([]);
    expect(db.select().from(groupMembers).all()).toEqual([]);
    expect(db.select().from(rootGrants).all()).toEqual([]);
    expect(db.select().from(entryShares).all()).toEqual([]);
  });

  it("writes who left into the audit log", async () => {
    const w = await weber();
    await remove(w, anna(w));
    const events = w.o.setup.db.select().from(auditEvents).all();
    expect(events.at(-1)).toMatchObject({
      action: "member-left",
      actor: encodeBytes(w.o.owner.accountId),
      subject: anna(w),
    });
  });

  it("lets owners and admins remove, an admin only members, nobody themselves, nobody twice", async () => {
    const w = await weber();
    const sandra = withSandra(w);
    const me = encodeBytes(w.o.owner.accountId);
    // Anna as a plain member may remove no one
    expect((await remove(w, sandra, w.annaToken)).status).toBe(403);
    w.o.setup.db
      .update(accounts)
      .set({ role: "admin" })
      .where(eq(accounts.id, anna(w)))
      .run();
    expect((await remove(w, me, w.annaToken)).status).toBe(403);
    expect((await remove(w, sandra, w.annaToken)).status).toBe(200);
    expect((await remove(w, sandra)).status).toBe(409);
    expect((await remove(w, me)).status).toBe(409);
    expect((await remove(w, encodeBytes(new Uint8Array(16).fill(9)))).status).toBe(404);
    // An owner may remove an admin
    expect((await remove(w, anna(w))).status).toBe(200);
  });
});
