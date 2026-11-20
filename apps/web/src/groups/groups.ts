/**
 * Groups in the web app (K-305 part 5), without any interface: the company's groups with names of
 * their members, the groups linked to a vault, and what a vault's members have to do with them.
 * A group is a label the server keeps; it gives no access, it only files requests.
 */

import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { idKey, type MemberView, type VaultRole } from "@kennwort/core";
import type { Session } from "../session/session.ts";

export type Group = { id: string; name: string; members: Uint8Array[] };
export type Link = { groupId: string; role: VaultRole };
type Done = { ok: true } | { ok: false; error: "locked" | "unreachable" };

const tokenOf = (session: Session) => session.opened()?.token;

const done = (ok: boolean): Done => (ok ? { ok: true } : { ok: false, error: "unreachable" });

/** Runs a call with the session's token; a locked account sends nothing */
const withToken = async (session: Session, run: (token: string) => Promise<boolean>) => {
  const token = tokenOf(session);
  return token ? done(await run(token)) : ({ ok: false, error: "locked" } as const);
};

export const loadGroups = async (api: GroupApi, session: Session) => {
  const token = tokenOf(session);
  return token ? api.groups(token) : undefined;
};

export const createGroup = (api: GroupApi, session: Session, name: string) =>
  withToken(session, (token) => api.newGroup(token, name.trim()));

export const deleteGroup = (api: GroupApi, session: Session, groupId: string) =>
  withToken(session, (token) => api.deleteGroup(token, groupId));

export const joinGroup = (
  api: GroupApi,
  session: Session,
  groupId: string,
  accountId: Uint8Array,
) => withToken(session, (token) => api.joinGroup(token, groupId, accountId));

export const leaveGroup = (
  api: GroupApi,
  session: Session,
  groupId: string,
  accountId: Uint8Array,
) => withToken(session, (token) => api.leaveGroup(token, groupId, accountId));

export const loadLinks = async (api: GroupApi, session: Session, vault: Vault) => {
  const token = tokenOf(session);
  return token ? api.vaultGroups(token, vault.ring.vaultId) : undefined;
};

export const linkGroup = (
  api: GroupApi,
  session: Session,
  vault: Vault,
  groupId: string,
  role: VaultRole,
) => withToken(session, (token) => api.linkGroup(token, vault.ring.vaultId, groupId, role));

export const unlinkGroup = (api: GroupApi, session: Session, vault: Vault, groupId: string) =>
  withToken(session, (token) => api.unlinkGroup(token, vault.ring.vaultId, groupId));

/** Owners and admins keep groups, once the pinned root confirms their role */
export const mayKeepGroups = (me: MemberView | undefined) =>
  me?.status === "certified" && (me.role === "owner" || me.role === "admin");

/** People of the company who are not in the group yet */
export const outsideGroup = (group: Group, people: MemberView[]) =>
  people.filter((p) => !group.members.some((m) => idKey(m) === idKey(p.accountId)));

/**
 * Members of a vault with linked groups who are in none of them: whom a manager may want to
 * remove after they left a group. Managers are left out; they keep the vault running.
 */
export const outsideLinkedGroups = (vault: Vault, links: Link[], groups: Group[]) => {
  if (links.length === 0) return new Set<string>();
  const inLinked = new Set(
    groups
      .filter((g) => links.some((l) => l.groupId === g.id))
      .flatMap((g) => g.members.map(idKey)),
  );
  return new Set(
    [...vault.log.members]
      .filter(([key, member]) => member.role !== "manage" && !inLinked.has(key))
      .map(([key]) => key),
  );
};
