/**
 * What the groups linked to a vault mean for its requests (K-305 part 5): the role a person is
 * asked in with (the highest of the linked groups they are in), and which requests a group filed
 * still stand once a group is unlinked, deleted or left.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { groupMembers, vaultGroups, vaultRequests } from "../db/schema.ts";

const RANK = { read: 0, edit: 1, manage: 2 } as const;
type Role = keyof typeof RANK;

/** Per account in a linked group: the highest role a linked group asks it in with */
export const linkedRoles = (db: Db, vaultId: string) => {
  const rows = db
    .select({
      accountId: groupMembers.accountId,
      role: vaultGroups.role,
      groupId: vaultGroups.groupId,
    })
    .from(vaultGroups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, vaultGroups.groupId))
    .where(eq(vaultGroups.vaultId, vaultId))
    .all();
  const roles = new Map<string, { role: Role; groupId: string }>();
  for (const row of rows) {
    const known = roles.get(row.accountId);
    if (!known || RANK[row.role] > RANK[known.role])
      roles.set(row.accountId, { role: row.role, groupId: row.groupId });
  }
  return new Map([...roles].map(([accountId, { role }]) => [accountId, role]));
};

/** The linked group a request can stand on now, if any */
const standingGroup = (db: Db, vaultId: string, accountId: string) =>
  db
    .select({ groupId: vaultGroups.groupId })
    .from(vaultGroups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, vaultGroups.groupId))
    .where(and(eq(vaultGroups.vaultId, vaultId), eq(groupMembers.accountId, accountId)))
    .get()?.groupId;

/**
 * After a group was unlinked, deleted or left: a request a group filed stays only while its
 * person is in some linked group (then it stands on that one); one a person filed always stays
 */
export const pruneGroupRequests = (db: Db, vaultIds: string[]) => {
  if (vaultIds.length === 0) return;
  const filed = db
    .select()
    .from(vaultRequests)
    .where(and(inArray(vaultRequests.vaultId, vaultIds), isNotNull(vaultRequests.viaGroup)))
    .all();
  for (const request of filed) {
    const row = and(
      eq(vaultRequests.vaultId, request.vaultId),
      eq(vaultRequests.accountId, request.accountId),
    );
    const groupId = standingGroup(db, request.vaultId, request.accountId);
    if (groupId) db.update(vaultRequests).set({ viaGroup: groupId }).where(row).run();
    else db.delete(vaultRequests).where(row).run();
  }
};

/** The vaults a group is linked to */
export const vaultsOfGroup = (db: Db, groupId: string) =>
  db
    .select({ vaultId: vaultGroups.vaultId })
    .from(vaultGroups)
    .where(eq(vaultGroups.groupId, groupId))
    .all()
    .map((row) => row.vaultId);
