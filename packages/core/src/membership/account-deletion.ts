/**
 * Deleting an account (K-607, docs/sicherheitsdesign.md P-28): what becomes of each vault and of the
 * company when a person deletes their account. The same rules hold on the device, which signs its
 * own removal where another manager remains, and on the server, which refuses a deletion that would
 * leave a vault or the company without anyone to manage it. Pure: members and accounts in, a plan
 * out; the members are keyed however the caller keys them (hex in a checked log, base64url on the
 * server), `me` in the same way.
 */

/** A member as a log names it: its role and until when (Unix seconds, 0 for no end) */
export type DeletionMember = { role: string; validUntil: number };

/**
 * - `drop`: nobody else is in the vault; the server deletes it with its entries
 * - `leave`: another manager remains; the device signs its own `remove`, a manager rotates (P-11)
 * - `await`: the person does not manage the vault; a manager removes them and rotates (P-11)
 * - `sole-manager`: others remain but nobody else may manage it; the deletion waits
 */
export type VaultFate = "drop" | "leave" | "await" | "sole-manager";

const isManager = (member: DeletionMember, now: number) =>
  member.role === "manage" && (member.validUntil === 0 || member.validUntil > now);

/** What becomes of one vault; undefined when the log does not name the person */
export const vaultFate = (
  members: ReadonlyMap<string, DeletionMember>,
  me: string,
  now: number,
): VaultFate | undefined => {
  const mine = members.get(me);
  if (!mine) return undefined;
  const others = [...members].filter(([key]) => key !== me).map(([, member]) => member);
  if (others.length === 0) return "drop";
  if (!isManager(mine, now)) return "await";
  return others.some((member) => isManager(member, now)) ? "leave" : "sole-manager";
};

export type DeletionPlan = Record<VaultFate, string[]>;

/** Each vault the person is in, by its fate */
export const deletionPlan = (
  vaults: readonly { id: string; members: ReadonlyMap<string, DeletionMember> }[],
  me: string,
  now: number,
): DeletionPlan => {
  const plan: DeletionPlan = { drop: [], leave: [], await: [], "sole-manager": [] };
  for (const vault of vaults) {
    const fate = vaultFate(vault.members, me, now);
    if (fate) plan[fate].push(vault.id);
  }
  return plan;
};

/** An account of the company as the server lists it */
export type DeletionAccount = { id: string; role: string; leftAt: number | null };

/**
 * What becomes of the company: `erase` when nobody else is left in it (everything of the company
 * goes), `last-owner` when others remain but no other owner (an owner hands over first), else
 * `leave`. Undefined for an account the company does not have or that has left already.
 */
export const companyFate = (
  accounts: readonly DeletionAccount[],
  me: string,
): "erase" | "last-owner" | "leave" | undefined => {
  const active = accounts.filter((account) => account.leftAt === null);
  const mine = active.find((account) => account.id === me);
  if (!mine) return undefined;
  const others = active.filter((account) => account.id !== me);
  if (others.length === 0) return "erase";
  const anotherOwner = others.some((account) => account.role === "owner");
  return mine.role === "owner" && !anotherOwner ? "last-owner" : "leave";
};
