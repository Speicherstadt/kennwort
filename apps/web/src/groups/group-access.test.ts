import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import { loadVaults, newVault, type Vault } from "@kennwort/client/vaults/vaults.ts";
import { idKey, type MemberView } from "@kennwort/core";
import { describe, expect, it, vi } from "vitest";
import { ownerRow } from "../members/members.test-kit.ts";
import { addToVault } from "../vaults/vault-members.ts";
import { createVaultStore } from "../vaults/vault-store.ts";
import { certifiedAnna, jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import {
  joinGroupWithAccess,
  leaveGroupWithAccess,
  linkableVaults,
  linkGroupWithAccess,
  loadAllVaultLinks,
  planJoinAccess,
  planLeaveAccess,
  planLinkAccess,
  sharedVaults,
  type VaultLink,
} from "./group-access.ts";
import type { Group } from "./groups.ts";

const groupServer = () => {
  const groups: Group[] = [];
  const links = new Map<string, { groupId: string; role: "read" | "edit" | "manage" }[]>();
  const api: GroupApi = {
    groups: async () => groups.map((g) => ({ ...g, members: [...g.members] })),
    newGroup: async (_t, name) => {
      groups.push({ id: `g${groups.length}`, name, members: [] });
      return true;
    },
    deleteGroup: async () => true,
    joinGroup: async (_t, id, accountId) => {
      groups.find((g) => g.id === id)?.members.push(accountId);
      return true;
    },
    leaveGroup: async (_t, id, accountId) => {
      const group = groups.find((g) => g.id === id);
      if (group) group.members = group.members.filter((m) => idKey(m) !== idKey(accountId));
      return true;
    },
    vaultGroups: async (_t, vaultId) => links.get(idKey(vaultId)) ?? [],
    linkGroup: async (_t, vaultId, groupId, role) => {
      const key = idKey(vaultId);
      const list = (links.get(key) ?? []).filter((l) => l.groupId !== groupId);
      list.push({ groupId, role });
      links.set(key, list);
      return true;
    },
    unlinkGroup: async (_t, vaultId, groupId) => {
      const key = idKey(vaultId);
      links.set(
        key,
        (links.get(key) ?? []).filter((l) => l.groupId !== groupId),
      );
      return true;
    },
  };
  return { api, groups, links };
};

const setup = async () => {
  const w = await jonasWithVaults((c) => [ownerRow(c), certifiedAnna(c)]);
  const g = groupServer();
  await newVault(w.api, w.c.session, "Persönlich", true);
  await newVault(w.api, w.c.session, "Büro");
  await newVault(w.api, w.c.session, "Lieferanten");
  const store = createVaultStore(w.api, w.c.session);
  const loaded = await store.reload();
  if (!loaded) throw new Error("failed to load vaults");
  const api = { ...w.api, ...g.api };
  const byName = (name: string) => {
    const found = loaded.vaults.find((v) => v.name === name);
    if (!found) throw new Error(`missing vault ${name}`);
    return found;
  };
  const anna = loaded.people.find((p) => p.name === "Anna");
  if (!anna) throw new Error("missing Anna");
  return { ...w, g, api, store, loaded, byName, anna };
};

describe("group-access", () => {
  it("loads links only for shared vaults and lists unlinked managed vaults", async () => {
    const w = await setup();
    await w.g.api.newGroup("tok", "Büro-Team");
    const buero = w.byName("Büro");
    const lieferanten = w.byName("Lieferanten");
    await w.g.api.linkGroup("tok", buero.ring.vaultId, "g0", "read");

    const all = await loadAllVaultLinks(w.g.api, w.c.session, w.loaded.vaults);
    expect(all.map((l) => [l.vault.name, l.groupId, l.role])).toEqual([["Büro", "g0", "read"]]);

    const shared = sharedVaults(w.loaded.vaults, w.c.session);
    const available = linkableVaults("g0", shared, all);
    expect(available.map((v) => v.name)).toEqual([lieferanten.name]);
  });

  it("plans direct grants for verified people on managed vaults and requests otherwise", async () => {
    const w = await setup();
    const buero = w.byName("Büro");
    const readOnly: Vault = { ...w.byName("Lieferanten"), role: "read" };
    const links: VaultLink[] = [
      { vault: buero, groupId: "g0", role: "edit" },
      { vault: readOnly, groupId: "g0", role: "read" },
    ];

    const plan = planJoinAccess(w.anna, "g0", links);
    expect(plan.directGrant.map((d) => [d.vault.name, d.role])).toEqual([["Büro", "edit"]]);
    expect(plan.willRequest.map((v) => v.name)).toEqual(["Lieferanten"]);

    const pending: MemberView = {
      accountId: new Uint8Array(16).fill(9),
      name: "Tom",
      role: "member",
      status: "pending",
    };
    const pendingPlan = planJoinAccess(pending, "g0", links);
    expect(pendingPlan.directGrant).toEqual([]);
    expect(pendingPlan.willRequest.map((v) => v.name)).toEqual(["Büro", "Lieferanten"]);
  });

  it("grants direct access to multiple vaults when a verified person joins a group", async () => {
    const w = await setup();
    await w.g.api.newGroup("tok", "Büro-Team");
    const buero = w.byName("Büro");
    const lieferanten = w.byName("Lieferanten");
    await w.g.api.linkGroup("tok", buero.ring.vaultId, "g0", "read");
    await w.g.api.linkGroup("tok", lieferanten.ring.vaultId, "g0", "edit");

    const links = await loadAllVaultLinks(w.g.api, w.c.session, w.loaded.vaults);
    const plan = planJoinAccess(w.anna, "g0", links);
    const res = await joinGroupWithAccess(w.api, w.c.session, w.store, "g0", w.anna, plan);
    expect(res).toEqual({ ok: true });

    const reloaded = await loadVaults(w.api, w.c.session);
    if (!reloaded.ok) throw new Error(reloaded.error);
    const annaKey = idKey(w.anna.accountId);
    expect(
      reloaded.value.vaults.find((v) => v.name === "Büro")?.log.members.get(annaKey)?.role,
    ).toBe("read");
    expect(
      reloaded.value.vaults.find((v) => v.name === "Lieferanten")?.log.members.get(annaKey)?.role,
    ).toBe("edit");
  });

  it("grants verified group members directly when linking a group to a vault", async () => {
    const w = await setup();
    await w.g.api.newGroup("tok", "Büro-Team");
    await w.g.api.joinGroup("tok", "g0", w.anna.accountId);
    const buero = w.byName("Büro");
    const group = w.g.groups[0] as Group;
    const plan = planLinkAccess(group, buero, w.loaded.people);
    expect(plan.directGrant.map((p) => p.name)).toEqual(["Anna"]);
    expect(plan.willRequest).toEqual([]);

    const res = await linkGroupWithAccess(
      w.api,
      w.c.session,
      w.store,
      buero,
      group.id,
      "edit",
      plan.directGrant,
    );
    expect(res).toEqual({ ok: true });

    const reloaded = await loadVaults(w.api, w.c.session);
    if (!reloaded.ok) throw new Error(reloaded.error);
    const annaKey = idKey(w.anna.accountId);
    expect(
      reloaded.value.vaults.find((v) => v.name === "Büro")?.log.members.get(annaKey)?.role,
    ).toBe("edit");
  });

  it("plans leave removals only for vaults without another linked group for that person", async () => {
    const w = await setup();
    const buero = w.byName("Büro");
    const lieferanten = w.byName("Lieferanten");
    if (!w.anna.certificate) throw new Error("no cert");
    await addToVault(w.api, w.c.session, buero, w.anna.certificate, "read");
    await addToVault(w.api, w.c.session, lieferanten, w.anna.certificate, "read");
    const reloaded = await w.store.reload();
    if (!reloaded) throw new Error("reload failed");
    const freshBuero = reloaded.vaults.find((v) => v.name === "Büro") as Vault;
    const freshLief = reloaded.vaults.find((v) => v.name === "Lieferanten") as Vault;

    const groups: Group[] = [
      { id: "g0", name: "Büro-Team", members: [w.anna.accountId] },
      { id: "g1", name: "Einkauf", members: [w.anna.accountId] },
    ];
    const links: VaultLink[] = [
      { vault: freshBuero, groupId: "g0", role: "read" },
      { vault: freshLief, groupId: "g0", role: "read" },
      // Anna is also in Einkauf, which is linked to Lieferanten -> must NOT be removed from Lieferanten
      { vault: freshLief, groupId: "g1", role: "read" },
    ];
    const removable = planLeaveAccess(w.anna.accountId, "g0", groups, links, w.c.opened.accountId);
    expect(removable.map((v) => v.name)).toEqual(["Büro"]);

    // Never offers to remove self
    expect(
      planLeaveAccess(w.c.opened.accountId, "g0", groups, links, w.c.opened.accountId),
    ).toEqual([]);
  });

  it("removes from group and calls exits.remove for each confirmed vault", async () => {
    const w = await setup();
    await w.g.api.newGroup("tok", "Büro-Team");
    await w.g.api.joinGroup("tok", "g0", w.anna.accountId);
    const buero = w.byName("Büro");
    const exits = {
      remove: vi.fn(async () => ({ ok: true as const })),
      changeRole: vi.fn(),
      catchUp: vi.fn(),
    };
    const res = await leaveGroupWithAccess(
      w.g.api,
      w.c.session,
      w.store,
      exits as never,
      "g0",
      w.anna.accountId,
      [buero],
    );
    expect(res).toEqual({ ok: true });
    expect(w.g.groups[0]?.members).toEqual([]);
    expect(exits.remove).toHaveBeenCalledTimes(1);
  });
});
