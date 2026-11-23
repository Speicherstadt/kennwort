// K-707 (P-03): Jonas sets up a passkey to unlock; the server keeps only AK sealed under its PRF
// output, for his own passkeys, and drops it with the passkey
import { describe, expect, it } from "bun:test";
import { encodeBytes, StoredWire } from "@kennwort/core";
import { eq } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { authPasskey, authUser, unlockPasskeys } from "../db/schema.ts";
import { ownerWithKeys } from "../testing/owner-with-keys.ts";

const CODE = "weber-haustechnik-setup";
const credential = encodeBytes(new Uint8Array(20).fill(3));
// A sealed AK is 73 bytes (F-01: version, nonce, 32 bytes, tag)
const sealed = encodeBytes(new Uint8Array(73).fill(7));

const passkeyRow = (id: string, userId: string, credentialID: string) => ({
  id,
  publicKey: "AA",
  userId,
  credentialID,
  counter: 0,
  deviceType: "singleDevice",
  backedUp: false,
});

/** Another account's passkey */
const anna = (db: Db) => {
  const at = new Date();
  db.insert(authUser)
    .values({
      id: "anna",
      name: "Anna",
      email: "anna.test",
      companyId: "x",
      createdAt: at,
      updatedAt: at,
    })
    .run();
  db.insert(authPasskey)
    .values(passkeyRow("pk-anna", "anna", "YW5uYQ"))
    .run();
};

const jonas = async () => {
  const o = await ownerWithKeys(CODE, "Jonas Heizung Bad Fliese");
  const id = encodeBytes(o.owner.accountId);
  const { db } = o.setup;
  db.insert(authPasskey)
    .values(passkeyRow("pk-jonas", id, credential))
    .run();
  const put = (body: unknown, token: string | undefined = o.token) =>
    o.setup.request("/api/account/unlock-passkeys", { method: "PUT", token, body });
  const remove = (id: string, token: string | undefined = o.token) =>
    o.setup.request(`/api/account/unlock-passkeys/${id}`, { method: "DELETE", token });
  const keys = async () =>
    StoredWire.parse(await (await o.setup.request("/api/account/keys", { token: o.token })).json());
  return { o, id, db, put, remove, keys };
};

describe("passkeys that unlock (K-707)", () => {
  it("keeps AK sealed under a passkey of the account and serves it with the keys", async () => {
    const { put, keys, db } = await jonas();
    expect((await put({ credentialId: credential, sealed })).status).toBe(201);
    const served = await keys();
    expect(served.unlock.passkeys?.map((p) => encodeBytes(p.credentialId))).toEqual([credential]);
    expect(served.unlock.passkeys?.map((p) => encodeBytes(p.sealed))).toEqual([sealed]);
    expect(
      db
        .select()
        .from(unlockPasskeys)
        .all()
        .map((r) => r.passkeyId),
    ).toEqual(["pk-jonas"]);
  });

  it("serves no passkeys before one is set up", async () => {
    const { keys } = await jonas();
    expect((await keys()).unlock.passkeys).toEqual([]);
  });

  it("takes only a passkey of this account, once, and only a sealed AK", async () => {
    const { o, put, db } = await jonas();
    anna(db);
    expect((await put({ credentialId: "YW5uYQ", sealed })).status).toBe(404);
    expect((await put({ credentialId: "dW5rbm93bg", sealed })).status).toBe(404);
    expect((await put({ credentialId: credential, sealed: "AAAA" })).status).toBe(400);
    expect((await put({ credentialId: "a+b", sealed })).status).toBe(400);
    expect((await put({ credentialId: credential, sealed }, "")).status).toBe(401);
    expect((await put({ credentialId: credential, sealed })).status).toBe(201);
    expect((await put({ credentialId: credential, sealed })).status).toBe(409);
    expect(o.token).toBeTruthy();
  });

  it("removes the passkey with its sealed AK, only the account's own", async () => {
    const { put, remove, keys, db } = await jonas();
    await put({ credentialId: credential, sealed });
    anna(db);
    expect((await remove("YW5uYQ")).status).toBe(404);
    expect((await remove(credential, "")).status).toBe(401);
    expect((await remove(credential)).status).toBe(200);
    expect((await keys()).unlock.passkeys).toEqual([]);
    expect(db.select().from(authPasskey).where(eq(authPasskey.id, "pk-jonas")).all()).toEqual([]);
    expect(db.select().from(unlockPasskeys).all()).toEqual([]);
    expect((await remove(credential)).status).toBe(404);
  });

  it("drops the sealed AK with the passkey, as renewal does with every passkey (P-12)", async () => {
    const { put, id, db, keys } = await jonas();
    await put({ credentialId: credential, sealed });
    db.delete(authPasskey).where(eq(authPasskey.userId, id)).run();
    expect(db.select().from(unlockPasskeys).all()).toEqual([]);
    expect((await keys()).unlock.passkeys).toEqual([]);
  });
});
