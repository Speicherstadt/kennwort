// K-602 (P-24): the events the server handles anyway write notifications for the right accounts,
// with IDs only. Weber Haustechnik: Jonas invites Anna, she asks for access to Büro, he adds her;
// he names her for emergency access, she asks for it, he objects; a one-time link is fetched.
import { describe, expect, it } from "bun:test";
import { addMember, encodeBytes, LinkCreated, Notification, toWire } from "@kennwort/core";
import type { Db } from "../db/database.ts";
import { notifications } from "../db/schema.ts";
import { weberWithBuero } from "../testing/emergency-setup.ts";
import { signInSetup } from "../testing/sign-in-setup.ts";
import { createBuero, NOW, post, stateOf, weber } from "../testing/weber-vaults.ts";
import { MAX_NOTIFICATIONS } from "./notify.ts";

const rowsOf = (db: Db) =>
  db
    .select()
    .from(notifications)
    .all()
    .map(({ accountId, kind, subject, actor }) => ({ accountId, kind, subject, actor }));

/** Every row as the API would list it, and none with a name the server knows (labels) */
const onlyIds = (db: Db, names: string[]) => {
  for (const row of db.select().from(notifications).all()) {
    expect(Notification.safeParse({ ...row, read: false }).success).toBe(true);
    for (const name of names) expect(JSON.stringify(row)).not.toContain(name);
  }
};

describe("events → notifications", () => {
  it("tells Jonas that Anna accepted his invitation and asks for access, and Anna that he added her", async () => {
    const w = await weber();
    const db = w.o.setup.db;
    const jonas = encodeBytes(w.jonas.signer.accountId);
    const anna = encodeBytes(w.annaId);
    const accepted = rowsOf(db);
    expect(accepted).toEqual([
      { accountId: jonas, kind: "invitation-accepted", subject: expect.any(String), actor: anna },
    ]);

    const { vault, vaultId } = await createBuero(w);
    await w.o.setup.request(`/api/vaults/${vaultId}/requests`, {
      method: "POST",
      token: w.annaToken,
      body: {},
    });
    expect(rowsOf(db).at(-1)).toEqual({
      accountId: jonas,
      kind: "access-requested",
      subject: vaultId,
      actor: anna,
    });

    const s0 = stateOf(w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      w.jonas.signer,
      s0.value,
      vault.ring,
      w.annaCert,
      { role: "read", validUntil: 0 },
      NOW + 1,
    );
    await post(w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    expect(rowsOf(db).at(-1)).toEqual({
      accountId: anna,
      kind: "vault-added",
      subject: vaultId,
      actor: jonas,
    });
    // The invitation's label ("Anna") is plain text the server holds; no row copies it
    onlyIds(db, ["Anna", "Büro"]);
  });

  it("tells the managers of an access request once: asking again cannot flood their list", async () => {
    const w = await weber();
    const db = w.o.setup.db;
    const jonas = encodeBytes(w.jonas.signer.accountId);
    const { vaultId } = await createBuero(w);
    const ask = () =>
      w.o.setup.request(`/api/vaults/${vaultId}/requests`, {
        method: "POST",
        token: w.annaToken,
        body: {},
      });
    expect((await ask()).status).toBe(201);
    // Anna asks over and over: Jonas's older rows (here the accepted invitation; an emergency
    // request he must object to within the waiting time alike, P-14) must not be pruned by it
    for (let i = 0; i < MAX_NOTIFICATIONS; i++) expect((await ask()).status).toBe(201);
    expect(
      rowsOf(db)
        .filter((row) => row.accountId === jonas)
        .map((row) => row.kind),
    ).toEqual(["invitation-accepted", "access-requested"]);
  });

  it("tells Jonas of Anna's emergency request and Anna of his grant and his objection", async () => {
    const e = await weberWithBuero();
    const db = e.w.o.setup.db;
    const anna = e.w.annaIdText;
    db.delete(notifications).run();
    const made = await e.grant();
    expect(rowsOf(db)).toEqual([
      { accountId: anna, kind: "emergency-granted", subject: null, actor: e.jonasIdText },
    ]);
    // The same grant made anew (after a rotation) is no news
    db.delete(notifications).run();
    await e.grant(undefined, { waitSeconds: 7 * 86_400, time: e.seconds() + 1 });
    expect(rowsOf(db)).toEqual([]);

    const latest = await e.grant(undefined, { waitSeconds: 7 * 86_400, time: e.seconds() + 2 });
    expect((await e.annaRequests(latest.grant)).status).toBe(201);
    expect(rowsOf(db)).toEqual([
      { accountId: e.jonasIdText, kind: "emergency-requested", subject: null, actor: anna },
    ]);
    const objected = await e.request(`/api/emergency/${anna}/objection`, {
      body: e.statement("emergency-objection", "jonas", latest.grant, e.seconds()),
    });
    expect(objected.status).toBe(200);
    expect(rowsOf(db).at(-1)).toEqual({
      accountId: anna,
      kind: "emergency-answered",
      subject: null,
      actor: e.jonasIdText,
    });
    expect(made.status).toBe(200);
    onlyIds(db, ["Anna", "Jonas", "Büro"]);
  });

  it("tells the creator of a one-time link of each fetch, by the ID it lists the link by", async () => {
    const server = await signInSetup();
    const jonas = await server.member("weber", "owner");
    const created = LinkCreated.parse(
      await (
        await server.request("/api/links", {
          token: jonas.token,
          body: {
            ciphertext: encodeBytes(new Uint8Array(80)),
            expiresInMs: 3_600_000,
            maxFetches: 2,
          },
        })
      ).json(),
    );
    await server.request(`/auth/links/${created.fetchId}/open`, { method: "POST" });
    expect(rowsOf(server.db)).toEqual([
      { accountId: jonas.id, kind: "link-opened", subject: created.id, actor: null },
    ]);
    // The fetch ID fetches the ciphertext: no row keeps it
    expect(JSON.stringify(server.db.select().from(notifications).all())).not.toContain(
      created.fetchId,
    );
  });
});
