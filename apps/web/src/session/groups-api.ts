/** Groups (K-305 part 5): owners and admins keep them; a group only asks, never gives access */
import { encodeBytes, GroupsWire, VaultGroupsWire, type VaultRole } from "@kennwort/core";
import type { Call } from "./api.ts";

const ok = (answer: { status: number }) => answer.status === 200 || answer.status === 201;

export const groupCalls = (call: Call) => ({
  groups: async (token: string) => {
    const answer = await call("GET", "/api/groups", undefined, token);
    const parsed = GroupsWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.groups : undefined;
  },
  newGroup: async (token: string, name: string) =>
    ok(await call("POST", "/api/groups", { name }, token)),
  deleteGroup: async (token: string, groupId: string) =>
    ok(await call("DELETE", `/api/groups/${encodeURIComponent(groupId)}`, undefined, token)),
  joinGroup: async (token: string, groupId: string, accountId: Uint8Array) =>
    ok(
      await call(
        "PUT",
        `/api/groups/${encodeURIComponent(groupId)}/members/${encodeBytes(accountId)}`,
        {},
        token,
      ),
    ),
  leaveGroup: async (token: string, groupId: string, accountId: Uint8Array) =>
    ok(
      await call(
        "DELETE",
        `/api/groups/${encodeURIComponent(groupId)}/members/${encodeBytes(accountId)}`,
        undefined,
        token,
      ),
    ),
  vaultGroups: async (token: string, vaultId: Uint8Array) => {
    const answer = await call(
      "GET",
      `/api/vaults/${encodeBytes(vaultId)}/groups`,
      undefined,
      token,
    );
    const parsed = VaultGroupsWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.groups : undefined;
  },
  linkGroup: async (token: string, vaultId: Uint8Array, groupId: string, role: VaultRole) =>
    ok(
      await call(
        "PUT",
        `/api/vaults/${encodeBytes(vaultId)}/groups/${encodeURIComponent(groupId)}`,
        { role },
        token,
      ),
    ),
  unlinkGroup: async (token: string, vaultId: Uint8Array, groupId: string) =>
    ok(
      await call(
        "DELETE",
        `/api/vaults/${encodeBytes(vaultId)}/groups/${encodeURIComponent(groupId)}`,
        undefined,
        token,
      ),
    ),
});

export type GroupApi = ReturnType<typeof groupCalls>;
