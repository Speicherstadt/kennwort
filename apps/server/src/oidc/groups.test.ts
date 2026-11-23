// K-604: the provider's groups claim becomes requests and hints for managers, never access
import { describe, expect, it } from "bun:test";
import { addMember, encodeBytes, toWire } from "@kennwort/core";
import { and, eq } from "drizzle-orm";
import { companies, groupMembers, groups, notifications } from "../db/schema.ts";
import { type OidcWeber, oidcWeber } from "../testing/oidc-setup.ts";
import { createBuero, NOW, post, stateOf } from "../testing/weber-vaults.ts";
import { groupNames } from "./groups.ts";

describe("groupNames", () => {
  it("reads a list or a single name, drops a leading slash, duplicates and non-strings", () => {
    expect(groupNames({ groups: ["/Technik", "Büro", "Technik", 7, ""] }, "groups")).toEqual([
      "Technik",
      "Büro",
    ]);
    expect(groupNames({ roles: "Lager" }, "roles")).toEqual(["Lager"]);
    expect(groupNames({ groups: { a: 1 } }, "groups")).toEqual([]);
    expect(groupNames({}, "groups")).toEqual([]);
    expect(groupNames({ groups: ["x".repeat(101)] }, "groups")).toEqual([]);
    // Never a property of Object.prototype
    expect(groupNames({}, "constructor")).toEqual([]);
  });

  it("keeps at most 200 names", () => {
    const many = Array.from({ length: 300 }, (_, i) => `g${i}`);
    expect(groupNames({ groups: many }, "groups")).toHaveLength(200);
  });
});

const setUp = async () => {
  const s = await oidcWeber();
  const { vault, vaultId } = await createBuero(s.w);
  const made = await s.request("/api/groups", { token: s.w.o.token, body: { name: "Technik" } });
  const groupId = ((await made.json()) as { id: string }).id;
  await s.request(`/api/vaults/${vaultId}/groups/${groupId}`, {
    method: "PUT",
    token: s.w.o.token,
    body: { role: "edit" },
  });
  return { s, vault, vaultId, groupId, anna: encodeBytes(s.w.annaId) };
};

const requestsOf = async (s: OidcWeber, vaultId: string) => {
  const answer = await s.request(`/api/vaults/${vaultId}/requests`, { token: s.w.o.token });
  return ((await answer.json()) as { requests: { accountId: string }[] }).requests.map(
    (r) => r.accountId,
  );
};

const told = (s: OidcWeber, kind: string) =>
  s.w.o.setup.db
    .select()
    .from(notifications)
    .where(eq(notifications.kind, kind))
    .all()
    .map((n) => [n.accountId, n.subject, n.actor]);

const membership = (s: OidcWeber, groupId: string, accountId: string) =>
  s.w.o.setup.db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.accountId, accountId)))
    .get();

describe("the groups claim at login", () => {
  it("joins the group of the same name; its vault gets a request, its managers hear of it", async () => {
    const { s, vaultId, groupId, anna } = await setUp();
    await s.login({ sub: "anna", groups: ["Technik"] }, { token: s.w.annaToken });
    expect(membership(s, groupId, anna)).toMatchObject({ viaIdp: true });
    expect(await requestsOf(s, vaultId)).toEqual([anna]);
    const jonas = encodeBytes(s.w.o.owner.accountId);
    expect(told(s, "access-requested")).toEqual([[jonas, vaultId, anna]]);
    // The same claim again changes nothing and tells nobody twice
    await s.login({ sub: "anna", groups: ["Technik"] });
    expect(told(s, "access-requested")).toHaveLength(1);
  });

  it("leaves a group the provider gave once the claim drops it: the request goes", async () => {
    const { s, vaultId, groupId, anna } = await setUp();
    await s.login({ sub: "anna", groups: ["Technik"] }, { token: s.w.annaToken });
    await s.login({ sub: "anna", groups: [] });
    expect(membership(s, groupId, anna)).toBeUndefined();
    expect(await requestsOf(s, vaultId)).toEqual([]);
    // Not in the vault: nothing for the managers to remove
    expect(told(s, "group-left")).toEqual([]);
  });

  it("tells the managers when someone in the vault left the group; the access stays theirs to end", async () => {
    const { s, vault, vaultId, groupId, anna } = await setUp();
    await s.login({ sub: "anna", groups: ["Technik"] }, { token: s.w.annaToken });
    // Jonas adds Anna with his own signed entry, as the request asked
    const s0 = stateOf(s.w, vault.ring.vaultId, [vault.genesis]);
    if (!s0.ok) throw new Error(s0.error);
    const added = addMember(
      s.w.jonas.signer,
      s0.value,
      vault.ring,
      s.w.annaCert,
      { role: "edit", validUntil: 0 },
      NOW + 1,
    );
    await post(s.w, vaultId, {
      entry: toWire(added.entry),
      wrappedKey: encodeBytes(added.wrappedKey),
    });
    await s.login({ sub: "anna", groups: [] });
    expect(membership(s, groupId, anna)).toBeUndefined();
    const jonas = encodeBytes(s.w.o.owner.accountId);
    expect(told(s, "group-left")).toEqual([[jonas, vaultId, anna]]);
    // Still in the log: only a manager's client removes her and rotates the key (K-307)
    expect((await s.request(`/api/vaults/${vaultId}/log`, { token: s.w.annaToken })).status).toBe(
      200,
    );
  });

  it("keeps a membership an admin made, whatever the claim says", async () => {
    const { s, groupId, anna } = await setUp();
    await s.request(`/api/groups/${groupId}/members/${anna}`, {
      method: "PUT",
      token: s.w.o.token,
    });
    await s.login({ sub: "anna", groups: [] }, { token: s.w.annaToken });
    expect(membership(s, groupId, anna)).toMatchObject({ viaIdp: false });
  });

  it("reads the claim the operator named", async () => {
    const s = await oidcWeber({ groupsClaim: "roles" });
    const made = await s.request("/api/groups", { token: s.w.o.token, body: { name: "Lager" } });
    const groupId = ((await made.json()) as { id: string }).id;
    s.idp.state.tamper = { claims: (c) => ({ ...c, roles: ["Lager"] }) };
    await s.login({ sub: "anna", groups: ["Technik"] }, { token: s.w.annaToken });
    expect(membership(s, groupId, encodeBytes(s.w.annaId))).toMatchObject({ viaIdp: true });
  });

  it("joins no group of another company with the same name", async () => {
    const { s, anna } = await setUp();
    const db = s.w.o.setup.db;
    db.insert(companies).values({ id: "mueller", createdAt: 1 }).run();
    db.insert(groups)
      .values({ id: "mueller-technik", companyId: "mueller", name: "Technik", createdAt: 1 })
      .run();
    await s.login({ sub: "anna", groups: ["Technik"] }, { token: s.w.annaToken });
    expect(membership(s, "mueller-technik", anna)).toBeUndefined();
  });
});
