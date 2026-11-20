import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import { loadVaults, newVault, type Vault } from "@kennwort/client/vaults/vaults.ts";
import { idKey } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { ownerRow } from "../members/members.test-kit.ts";
import { addToVault } from "../vaults/vault-members.ts";
import { certifiedAnna, jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import {
  createGroup,
  type Group,
  joinGroup,
  linkGroup,
  loadGroups,
  loadLinks,
  mayKeepGroups,
  outsideGroup,
  outsideLinkedGroups,
} from "./groups.ts";

/** Groups in memory: what the server keeps, without its checks */
const groupServer = () => {
  const groups: Group[] = [];
  const links: { groupId: string; role: "read" | "edit" | "manage" }[] = [];
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
    leaveGroup: async () => true,
    vaultGroups: async () => links,
    linkGroup: async (_t, _v, groupId, role) => {
      links.push({ groupId, role });
      return true;
    },
    unlinkGroup: async () => true,
  };
  return { api, groups, links };
};

// K-305 part 5: Jonas keeps the group Büro-Team and links it to the vault Büro
const setup = async () => {
  const w = await jonasWithVaults((c) => [ownerRow(c), certifiedAnna(c)]);
  const g = groupServer();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const current = async () => {
    const loaded = await loadVaults(w.api, w.c.session);
    if (!loaded.ok) throw new Error(loaded.error);
    return { vault: loaded.value.vaults[0] as Vault, people: loaded.value.people };
  };
  return { ...w, g, current };
};

describe("groups", () => {
  it("creates a group, adds Anna, and offers only who is not in it yet", async () => {
    const w = await setup();
    expect(await createGroup(w.g.api, w.c.session, "  Büro-Team ")).toEqual({ ok: true });
    const [group] = (await loadGroups(w.g.api, w.c.session)) ?? [];
    if (!group) throw new Error("no group");
    expect(group.name).toBe("Büro-Team");
    const { people } = await w.current();
    const anna = people.find((p) => p.name === "Anna");
    if (!anna) throw new Error("no Anna");
    expect(await joinGroup(w.g.api, w.c.session, group.id, anna.accountId)).toEqual({ ok: true });
    const [after] = (await loadGroups(w.g.api, w.c.session)) ?? [];
    if (!after) throw new Error("no group");
    expect(outsideGroup(after, people).map((p) => idKey(p.accountId))).toEqual([
      idKey(w.c.opened.accountId),
    ]);
  });

  it("lets owners and admins keep groups, once the root key confirms their role", () => {
    const base = { accountId: new Uint8Array(16), name: null };
    expect(mayKeepGroups({ ...base, role: "owner", status: "certified" })).toBe(true);
    expect(mayKeepGroups({ ...base, role: "admin", status: "certified" })).toBe(true);
    expect(mayKeepGroups({ ...base, role: "member", status: "certified" })).toBe(false);
    expect(mayKeepGroups({ ...base, role: "owner", status: "pending" })).toBe(false);
    expect(mayKeepGroups(undefined)).toBe(false);
  });

  it("marks vault members in none of the linked groups, never a manager, and nobody without links", async () => {
    const w = await setup();
    let { vault, people } = await w.current();
    const anna = people.find((p) => p.name === "Anna");
    if (!anna?.certificate) throw new Error("no Anna");
    await addToVault(w.api, w.c.session, vault, anna.certificate, "read");
    ({ vault, people } = await w.current());
    await createGroup(w.g.api, w.c.session, "Büro-Team");
    expect(outsideLinkedGroups(vault, [], w.g.groups)).toEqual(new Set());
    expect(await linkGroup(w.g.api, w.c.session, vault, "g0", "read")).toEqual({ ok: true });
    const links = (await loadLinks(w.g.api, w.c.session, vault)) ?? [];
    expect(outsideLinkedGroups(vault, links, w.g.groups)).toEqual(new Set([idKey(anna.accountId)]));
    await joinGroup(w.g.api, w.c.session, "g0", anna.accountId);
    expect(outsideLinkedGroups(vault, links, w.g.groups)).toEqual(new Set());
  });

  it("sends nothing when the account is locked, and says when the server fails", async () => {
    const w = await setup();
    const failing = { ...w.g.api, newGroup: async () => false };
    expect(await createGroup(failing, w.c.session, "Büro-Team")).toEqual({
      ok: false,
      error: "unreachable",
    });
    w.c.session.lock();
    flush();
    expect(await createGroup(w.g.api, w.c.session, "Büro-Team")).toEqual({
      ok: false,
      error: "locked",
    });
    expect(await loadGroups(w.g.api, w.c.session)).toBeUndefined();
  });
});
