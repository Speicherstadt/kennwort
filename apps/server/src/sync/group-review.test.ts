// Review of K-305 part 5: requests a group filed, once the group is unlinked, deleted or left, and their role
import { describe, expect, it } from "bun:test";
import { encodeBytes } from "@kennwort/core";
import { createBuero, type Weber, weber } from "../testing/weber-vaults.ts";

const send = (w: Weber, method: string, path: string, body?: unknown, token = w.o.token) =>
  w.o.setup.request(path, { method, token, ...(body === undefined ? {} : { body }) });
const requestsOf = async (w: Weber, vaultId: string) => {
  const answer = await w.o.setup.request(`/api/vaults/${vaultId}/requests`, { token: w.o.token });
  return ((await answer.json()) as { requests: { accountId: string }[] }).requests.map(
    (r) => r.accountId,
  );
};
const newGroup = async (w: Weber) =>
  ((await (await send(w, "POST", "/api/groups", { name: "Büro-Team" })).json()) as { id: string })
    .id;

describe("group requests after the group is gone from the vault", () => {
  it("withdraws the requests a link filed when the manager unlinks the group", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const id = await newGroup(w);
    await send(w, "PUT", `/api/groups/${id}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${id}`, { role: "read" });
    expect(await requestsOf(w, vaultId)).toEqual([encodeBytes(w.annaId)]);
    await send(w, "DELETE", `/api/vaults/${vaultId}/groups/${id}`);
    // Anna never asked herself; only the link did
    expect(await requestsOf(w, vaultId)).toEqual([]);
  });

  it("withdraws the request a join filed when the person leaves the group again", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const id = await newGroup(w);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${id}`, { role: "read" });
    await send(w, "PUT", `/api/groups/${id}/members/${encodeBytes(w.annaId)}`);
    expect(await requestsOf(w, vaultId)).toEqual([encodeBytes(w.annaId)]);
    await send(w, "DELETE", `/api/groups/${id}/members/${encodeBytes(w.annaId)}`);
    expect(await requestsOf(w, vaultId)).toEqual([]);
  });

  it("withdraws the requests of a group that is deleted", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const id = await newGroup(w);
    await send(w, "PUT", `/api/groups/${id}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${id}`, { role: "read" });
    await send(w, "DELETE", `/api/groups/${id}`);
    expect(await requestsOf(w, vaultId)).toEqual([]);
  });
});

describe("the role a request comes with", () => {
  const rolesOf = async (w: Weber, vaultId: string) => {
    const answer = await w.o.setup.request(`/api/vaults/${vaultId}/requests`, { token: w.o.token });
    return ((await answer.json()) as { requests: { role: string | null }[] }).requests.map(
      (r) => r.role,
    );
  };

  it("is the highest role of the linked groups the person is in, none without a group", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    await w.o.setup.request(`/api/vaults/${vaultId}/requests`, {
      method: "POST",
      token: w.annaToken,
      body: {},
    });
    expect(await rolesOf(w, vaultId)).toEqual([null]);
    const team = await newGroup(w);
    const leads = (
      (await (await send(w, "POST", "/api/groups", { name: "Leitung" })).json()) as { id: string }
    ).id;
    await send(w, "PUT", `/api/groups/${team}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/groups/${leads}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${team}`, { role: "read" });
    expect(await rolesOf(w, vaultId)).toEqual(["read"]);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${leads}`, { role: "edit" });
    expect(await rolesOf(w, vaultId)).toEqual(["edit"]);
  });

  it("keeps a request Anna made herself when the group that also filed it is unlinked", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const id = await newGroup(w);
    await send(w, "PUT", `/api/groups/${id}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${id}`, { role: "read" });
    await w.o.setup.request(`/api/vaults/${vaultId}/requests`, {
      method: "POST",
      token: w.annaToken,
      body: {},
    });
    await send(w, "DELETE", `/api/vaults/${vaultId}/groups/${id}`);
    expect(await requestsOf(w, vaultId)).toEqual([encodeBytes(w.annaId)]);
  });

  it("keeps a group's request standing on another linked group the person is still in", async () => {
    const w = await weber();
    const { vaultId } = await createBuero(w);
    const team = await newGroup(w);
    const leads = (
      (await (await send(w, "POST", "/api/groups", { name: "Leitung" })).json()) as { id: string }
    ).id;
    await send(w, "PUT", `/api/groups/${team}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/groups/${leads}/members/${encodeBytes(w.annaId)}`);
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${team}`, { role: "read" });
    await send(w, "PUT", `/api/vaults/${vaultId}/groups/${leads}`, { role: "read" });
    await send(w, "DELETE", `/api/vaults/${vaultId}/groups/${team}`);
    expect(await requestsOf(w, vaultId)).toEqual([encodeBytes(w.annaId)]);
    await send(w, "DELETE", `/api/groups/${leads}/members/${encodeBytes(w.annaId)}`);
    expect(await requestsOf(w, vaultId)).toEqual([]);
  });
});
