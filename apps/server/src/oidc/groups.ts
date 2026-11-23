/**
 * The identity provider's groups claim as requests (K-604, P-25): a group of the company with the
 * same name as one the claim lists is joined, which only files access requests for the vaults
 * linked to it (P-05 step 4) and tells their managers; a group the provider gave and no longer lists
 * is left, which drops the requests it filed and tells the managers of the vaults the person is
 * still in, so they remove them and rotate the key (K-307). The provider never gives or takes access
 * to a vault: only a manager's signed log entry does, and only a manager's client rotates.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { groupMembers, groups, vaultGroups } from "../db/schema.ts";
import type { Notify } from "../notifications/notify.ts";
import { askForGroup, pruneGroupRequests, vaultsOfGroup } from "../sync/group-links.ts";
import { currentMembers } from "../sync/vault-chain.ts";

const MAX_GROUPS = 200;
const MAX_NAME = 100;

/**
 * The group names in the claim: a list of strings or one string; a leading "/" goes, as Keycloak
 * writes full group paths. Anything else counts as no groups.
 */
export const groupNames = (claims: Record<string, unknown>, claim: string): string[] => {
  const value = Object.hasOwn(claims, claim) ? claims[claim] : undefined;
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const names = list
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.replace(/^\//, "").trim())
    .filter((name) => name.length > 0 && name.length <= MAX_NAME);
  return [...new Set(names)].slice(0, MAX_GROUPS);
};

export type GroupSync = { joined: string[]; left: string[] };

type Deps = { db: Db; now: () => number; notify: Notify };

const managersOf = (db: Db, vaultId: string, now: number) =>
  [...currentMembers(db, vaultId, Math.floor(now / 1000))]
    .filter(([, member]) => member.role === "manage")
    .map(([id]) => id);

/** Joins one group; each vault linked to it gets a request and its managers hear of it */
const join = ({ db, now, notify }: Deps, companyId: string, accountId: string, groupId: string) => {
  db.insert(groupMembers).values({ groupId, accountId, viaIdp: true }).run();
  const links = db.select().from(vaultGroups).where(eq(vaultGroups.groupId, groupId)).all();
  for (const link of links)
    if (askForGroup(db, now(), link.vaultId, [accountId], groupId).length > 0)
      notify({
        companyId,
        recipients: managersOf(db, link.vaultId, now()),
        kind: "access-requested",
        subject: link.vaultId,
        actor: accountId,
      });
};

/** Leaves one group; the managers of the linked vaults the person is still in hear of it */
const leave = (
  { db, now, notify }: Deps,
  companyId: string,
  accountId: string,
  groupId: string,
) => {
  db.delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.accountId, accountId)))
    .run();
  const linked = vaultsOfGroup(db, groupId);
  pruneGroupRequests(db, linked);
  for (const vaultId of linked)
    if (currentMembers(db, vaultId, Math.floor(now() / 1000)).has(accountId))
      notify({
        companyId,
        recipients: managersOf(db, vaultId, now()),
        kind: "group-left",
        subject: vaultId,
        actor: accountId,
      });
};

/**
 * Brings the account's groups in line with the claim: joins each named group it is not in, leaves
 * each it joined through the provider that the claim no longer names; memberships an admin made
 * stay as they are
 */
export const syncGroups = (
  deps: Deps,
  account: { id: string; companyId: string },
  names: readonly string[],
): GroupSync => {
  const { db } = deps;
  const named =
    names.length === 0
      ? []
      : db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.companyId, account.companyId), inArray(groups.name, [...names])))
          .all()
          .map((row) => row.id);
  const memberships = db
    .select()
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.accountId, account.id), eq(groups.companyId, account.companyId)))
    .all()
    .map((row) => row.group_members);
  const current = new Set(memberships.map((m) => m.groupId));
  const joined = named.filter((id) => !current.has(id));
  const left = memberships
    .filter((m) => m.viaIdp && !named.includes(m.groupId))
    .map((m) => m.groupId);
  for (const groupId of joined) join(deps, account.companyId, account.id, groupId);
  for (const groupId of left) leave(deps, account.companyId, account.id, groupId);
  return { joined, left };
};
