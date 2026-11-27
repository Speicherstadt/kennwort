/**
 * Group-to-vault access planning and direct client-side granting/removal.
 *
 * The server remains untrusted: it never sees a vault key and can never grant access on its own.
 * When a manager adds a verified member to a group, or links a group to a vault, the UI previews
 * the exact vaults or people affected; once confirmed, this device signs each membership entry and
 * wraps the vault keys itself. Vaults managed by someone else, unverified accounts, and OIDC
 * sign-in groups continue to fall back to access requests for the vault's managers.
 */

import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import { personalVaultId, type Vault } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, idKey, type MemberView, type VaultRole } from "@kennwort/core";
import type { Session } from "../session/session.ts";
import type { DialogApi } from "../vaults/dialog-state.ts";
import type { Exits } from "../vaults/exit.ts";
import { addToVault, mayManage } from "../vaults/vault-members.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { type Group, joinGroup, leaveGroup, linkGroup, loadLinks } from "./groups.ts";

export type VaultLink = { vault: Vault; groupId: string; role: VaultRole };
export type CertifiedPerson = MemberView & { certificate: Certificate };

export type JoinPlan = {
  /** Vaults this device manages where the verified person will be added directly */
  directGrant: { vault: Vault; role: VaultRole }[];
  /** Vaults where joining can only file a request (not managed here, or person unverified) */
  willRequest: Vault[];
};

export type LinkPlan = {
  /** Verified group members not yet in the vault who will be added directly */
  directGrant: CertifiedPerson[];
  /** Group members not yet in the vault who cannot be granted yet (unverified or not manager) */
  willRequest: MemberView[];
};

/** Shared vaults of the company, leaving out this account's own personal vault */
export const sharedVaults = (vaults: readonly Vault[], session: Session) => {
  const opened = session.opened();
  const personal = opened?.accountKey && opened.state ? idKey(personalVaultId(opened)) : undefined;
  return personal ? vaults.filter((v) => idKey(v.ring.vaultId) !== personal) : [...vaults];
};

/** Loads all group links across the shared vaults this account has access to */
export const loadAllVaultLinks = async (
  api: GroupApi,
  session: Session,
  vaults: readonly Vault[],
): Promise<VaultLink[]> => {
  const shared = sharedVaults(vaults, session);
  const batches = await Promise.all(
    shared.map(async (vault) => {
      const links = await loadLinks(api, session, vault);
      return (links ?? []).map((link) => ({ vault, groupId: link.groupId, role: link.role }));
    }),
  );
  return batches.flat();
};

export const linksForGroup = (groupId: string, links: readonly VaultLink[]) =>
  links.filter((link) => link.groupId === groupId);

/** Shared vaults this device manages that are not linked to the group yet */
export const linkableVaults = (
  groupId: string,
  vaults: readonly Vault[],
  links: readonly VaultLink[],
) => {
  const linkedIds = new Set(linksForGroup(groupId, links).map((l) => l.vault.idText));
  return vaults.filter((v) => mayManage(v) && !linkedIds.has(v.idText));
};

const isCertified = (person: MemberView): person is CertifiedPerson =>
  person.status === "certified" && person.certificate !== undefined;

/** Plans which linked vaults can be granted directly vs. requested when a person joins a group */
export const planJoinAccess = (
  person: MemberView,
  groupId: string,
  links: readonly VaultLink[],
): JoinPlan => {
  const key = idKey(person.accountId);
  const directGrant: { vault: Vault; role: VaultRole }[] = [];
  const willRequest: Vault[] = [];
  for (const { vault, role } of linksForGroup(groupId, links)) {
    if (vault.log.members.has(key)) continue;
    if (mayManage(vault) && isCertified(person)) directGrant.push({ vault, role });
    else willRequest.push(vault);
  }
  return { directGrant, willRequest };
};

/** Plans which group members can be granted directly vs. requested when linking a group to a vault */
export const planLinkAccess = (
  group: Group,
  vault: Vault,
  people: readonly MemberView[],
): LinkPlan => {
  const directGrant: CertifiedPerson[] = [];
  const willRequest: MemberView[] = [];
  const canManage = mayManage(vault);
  for (const accountId of group.members) {
    const key = idKey(accountId);
    if (vault.log.members.has(key)) continue;
    const person = people.find((p) => idKey(p.accountId) === key);
    if (!person) continue;
    if (canManage && isCertified(person)) directGrant.push(person);
    else willRequest.push(person);
  }
  return { directGrant, willRequest };
};

/**
 * Vaults this device manages from which a person leaving `groupId` can be removed: excludes self,
 * vault managers, and vaults where the person still belongs to another linked group.
 */
export const planLeaveAccess = (
  accountId: Uint8Array,
  groupId: string,
  groups: readonly Group[],
  links: readonly VaultLink[],
  me: Uint8Array,
): Vault[] => {
  const key = idKey(accountId);
  if (key === idKey(me)) return [];
  const otherGroups = new Set(
    groups
      .filter((g) => g.id !== groupId && g.members.some((m) => idKey(m) === key))
      .map((g) => g.id),
  );
  const keptVaults = new Set(
    links.filter((l) => otherGroups.has(l.groupId)).map((l) => l.vault.idText),
  );
  const removable: Vault[] = [];
  for (const { vault } of linksForGroup(groupId, links)) {
    if (!mayManage(vault) || keptVaults.has(vault.idText)) continue;
    const member = vault.log.members.get(key);
    if (member && member.role !== "manage") removable.push(vault);
  }
  return removable;
};

/** Adds a person to a group and signs direct grants for the previewed vaults */
export const joinGroupWithAccess = async (
  api: DialogApi,
  session: Session,
  store: VaultStore | undefined,
  groupId: string,
  person: MemberView,
  plan: JoinPlan,
): Promise<{ ok: boolean }> => {
  const joined = await joinGroup(api, session, groupId, person.accountId);
  if (!joined.ok) return { ok: false };
  if (plan.directGrant.length === 0 || !isCertified(person)) return { ok: true };
  let allOk = true;
  for (const { vault, role } of plan.directGrant) {
    const added = await addToVault(api, session, vault, person.certificate, role);
    if (!added.ok) allOk = false;
  }
  await store?.reload();
  return { ok: allOk };
};

/** Links a group to a vault and signs direct grants sequentially so each log entry chains cleanly */
export const linkGroupWithAccess = async (
  api: DialogApi,
  session: Session,
  store: VaultStore | undefined,
  vault: Vault,
  groupId: string,
  role: VaultRole,
  directGrant: readonly CertifiedPerson[],
): Promise<{ ok: boolean }> => {
  const linked = await linkGroup(api, session, vault, groupId, role);
  if (!linked.ok) return { ok: false };
  if (directGrant.length === 0) return { ok: true };
  let current = vault;
  let allOk = true;
  for (const person of directGrant) {
    const added = await addToVault(api, session, current, person.certificate, role);
    if (!added.ok) {
      allOk = false;
      continue;
    }
    const reloaded = await store?.reload();
    current = reloaded?.vaults.find((v) => v.idText === vault.idText) ?? current;
  }
  return { ok: allOk };
};

/** Removes a person from a group and rotates out of the confirmed vaults */
export const leaveGroupWithAccess = async (
  api: GroupApi,
  session: Session,
  store: VaultStore | undefined,
  exits: Exits | undefined,
  groupId: string,
  accountId: Uint8Array,
  removeFrom: readonly Vault[],
): Promise<{ ok: boolean }> => {
  const left = await leaveGroup(api, session, groupId, accountId);
  if (!left.ok) return { ok: false };
  if (removeFrom.length === 0 || !store || !exits) return { ok: true };
  let allOk = true;
  for (const target of removeFrom) {
    const shown = store.shown();
    if (shown.state !== "ready") {
      allOk = false;
      break;
    }
    const fresh = shown.vaults.find((v) => v.idText === target.idText);
    if (!fresh) continue;
    const removed = await exits.remove(fresh, shown.trust, accountId, shown.left);
    if (!removed.ok) allOk = false;
  }
  return { ok: allOk };
};
