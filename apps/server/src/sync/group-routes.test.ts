// K-305 part 5: Jonas keeps the group "Büro-Team"; joining it, or linking it to a vault, only asks
import { describe, expect, it } from "bun:test";
import { addMember, encodeBytes, toWire } from "@kennwort/core";
import { createBuero, NOW, post, stateOf, type Weber, weber } from "../testing/weber-vaults.ts";

type Group = { id: string; name: string; members: string[] };

const send = (w: Weber, method: string, path: string, body?: unknown, token = w.o.token) =>
  w.o.setup.request(path, { method, token, ...(body === undefined ? {} : { body }) });
const groupsOf = async (w: Weber, token = w.o.token) =>
  ((await (await w.o.setup.request("/api/groups", { token })).json()) as { groups: Group[] })
    .groups;
const newGroup = async (w: Weber, name = "Büro-Team") => {
  const answer = await send(w, "POST", "/api/groups", { name });
  expect(answer.status).toBe(201);
  return ((await answer.json()) as { id: string }).id;
};
const requestsOf = async (w: Weber, vaultId: string) => {
  const answer = await w.o.setup.request(`/api/vaults/${vaultId}/requests`, { token: w.o.token });
  return ((await answer.json()) as { requests: { accountId: string }[] }).requests.map(
    (r) => r.accountId,
  );
};
const anna = (w: Weber) => encodeBytes(w.annaId);

describe("groups", () => {
  it("lets owners and admins keep groups and their members, everyone in the company see them", async () => {
    const w = await weber();
    const id = await newGroup(w);
    expect((await send(w, "PUT", `/api/groups/${id}/members/${anna(w)}`)).status).toBe(200);
    expect(await groupsOf(w, w.annaToken)).toEqual([{ id, name: "Büro-Team", members: [anna(w)] }]);
    // Anna is a member of the company, no admin
    expect((await send(w, "POST", "/api/groups", { name: "Lager" }, w.annaToken)).status).toBe(403);
    expect(
      (await send(w, "DELETE", `/api/groups/${id}/members/${anna(w)}`, undefined, w.annaToken))
        .status,
    ).toBe(403);
    expect((await send(w, "DELETE", `/api/groups/${id}`, undefined, w.annaToken)).status).toBe(403);
    expect((await send(w, "DELETE", `/api/groups/${id}/members/${anna(w)}`)).status).toBe(200);
    expect((await groupsOf(w))[0]?.members).toEqual([]);
    expect((await send(w, "DELETE", `/api/groups/${id}`)).status).toBe(200);
    expect(await groupsOf(w)).toEqual([]);
  });

  it("takes names of 1 to 100 characters and no account outside the company", async () => {
    const w = await weber();
    expect((await send(w, "POST", "/api/groups", { name: "  " })).status).toBe(400);
    expect((await send(w, "POST", "/api/groups", { name: "x".repeat(101) })).status).toBe(400);
    const id = await newGroup(w, "x".repeat(100));
    expect((await send(w, "PUT", `/api/groups/${id}/members/nobody`)).status).toBe(404);
    expect((await send(w, "PUT", `/api/groups/nothing/members/${anna(w)}`)).status).toBe(404);
  });
});

describe("groups linked to a vault", () => {
  it("asks the vault's managers for every member of a group they link, no one who is in already", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const id = await newGroup(w);
    await send(w, "PUT", `/api/groups/${id}/members/${anna(w)}`);
    await send(w, "PUT", `/api/groups/${id}/members/${encodeBytes(w.jonas.signer.accountId)}`);
    expect(
      (await send(w, "PUT", `/api/vaults/${vaultId}/groups/${id}`, { role: "edit" })).status,
    ).toBe(200);
    expect(await requestsOf(w, vaultId)).toEqual([anna(w)]);
    const links = await (
      await w.o.setup.request(`/api/vaults/${vaultId}/groups`, { token: w.o.token })
    ).json();
    expect(links).toEqual({ groups: [{ groupId: id, role: "edit" }] });
  });

  it("asks when someone joins a linked group; access still comes only with a manager's add", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const id = await newGroup(w);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${id}`, { role: "read" });
    expect(await requestsOf(w, vaultId)).toEqual([]);
    await send(w, "PUT", `/api/groups/${id}/members/${anna(w)}`);
    expect(await requestsOf(w, vaultId)).toEqual([anna(w)]);
    // the group gave Anna nothing: no vault, no log
    const listed = await (await w.o.setup.request("/api/vaults", { token: w.annaToken })).json();
    expect(listed).toEqual({ vaults: [] });
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
    expect(await requestsOf(w, vaultId)).toEqual([]);
  });

  it("lets only the vault's current managers link and unlink, members see the links", async () => {
    const w = await weber();
    const { vault, vaultId } = await createBuero(w);
    const id = await newGroup(w);
    const path = `/api/vaults/${vaultId}/groups/${id}`;
    // Anna is no member: she does not see the vault's groups
    expect(
      (await w.o.setup.request(`/api/vaults/${vaultId}/groups`, { token: w.annaToken })).status,
    ).toBe(404);
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
    expect(
      (await w.o.setup.request(`/api/vaults/${vaultId}/groups`, { token: w.annaToken })).status,
    ).toBe(200);
    expect((await send(w, "PUT", path, { role: "read" }, w.annaToken)).status).toBe(403);
    expect((await send(w, "PUT", path, { role: "owner" })).status).toBe(400);
    expect((await send(w, "PUT", path, { role: "read" })).status).toBe(200);
    expect((await send(w, "DELETE", path, undefined, w.annaToken)).status).toBe(403);
    expect((await send(w, "DELETE", path)).status).toBe(200);
    expect(
      (await send(w, "PUT", `/api/vaults/${vaultId}/groups/nothing`, { role: "read" })).status,
    ).toBe(404);
  });
});
