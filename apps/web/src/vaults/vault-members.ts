/**
 * The members of one vault (K-305 part 3, P-05): who is in it by its checked log, whom a manager
 * can add (only accounts the pinned root certified), and the signed entries for adding, changing a
 * role and removing. The server takes an entry only as the next link of the chain; when another
 * device wrote first it answers stale, and the page loads the vault again before trying anew.
 */
import {
  addMember,
  type Certificate,
  changeAccess,
  idKey,
  type MemberView,
  removeMember,
  type VaultRole,
} from "@kennwort/core";
import type { Session } from "../session/session.ts";
import type { Appended } from "../session/vaults-api.ts";
import type { Vault, VaultDeps } from "./vaults.ts";

export type VaultMember = {
  accountId: Uint8Array;
  name: string | null;
  role: VaultRole;
  validUntil: number;
  me: boolean;
};

export type ChangeError = Exclude<Appended, "ok"> | "locked";
type Changed = { ok: true } | { ok: false; error: ChangeError };

/** The account ID back from the log's key (idKey: hex) */
const fromIdKey = (key: string) =>
  Uint8Array.from(key.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

/**
 * Everyone the checked log names, with the name the members list gives them: the log decides who
 * is in the vault, so a member the server leaves out of the list still shows (review of K-305)
 */
export const vaultMembers = (vault: Vault, people: MemberView[], me: Uint8Array): VaultMember[] =>
  [...vault.log.members.entries()].map(([key, member]) => ({
    accountId: fromIdKey(key),
    name: people.find((person) => idKey(person.accountId) === key)?.name ?? null,
    role: member.role,
    validUntil: member.validUntil,
    me: key === idKey(me),
  }));

/** Certified people of the company who are not in the vault yet */
export const candidates = (vault: Vault, people: MemberView[]) =>
  people.filter(
    (person): person is MemberView & { certificate: Certificate } =>
      person.status === "certified" &&
      person.certificate !== undefined &&
      !vault.log.members.has(idKey(person.accountId)),
  );

export const mayManage = (vault: Vault) => vault.role === "manage";

/** Signed times never go back (P-06): at least the newest entry's time */
const timeFor = (vault: Vault) => Math.max(Math.floor(Date.now() / 1000), vault.log.time);

const signerOf = (session: Session) => {
  const opened = session.opened();
  return opened
    ? {
        token: opened.token,
        signer: { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey },
      }
    : undefined;
};

const outcome = (appended: Appended): Changed =>
  appended === "ok" ? { ok: true } : { ok: false, error: appended };

export const addToVault = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  person: Certificate,
  role: VaultRole,
): Promise<Changed> => {
  const me = signerOf(session);
  if (!me) return { ok: false, error: "locked" };
  const access = { role, validUntil: 0 };
  const made = addMember(me.signer, vault.log, vault.ring, person, access, timeFor(vault));
  return outcome(await api.appendLog(me.token, made.entry, made.wrappedKey));
};

export const changeVaultRole = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  accountId: Uint8Array,
  role: VaultRole,
): Promise<Changed> => {
  const me = signerOf(session);
  if (!me) return { ok: false, error: "locked" };
  // Only the role changes: a time limit the member has stays (review of K-305)
  const validUntil = vault.log.members.get(idKey(accountId))?.validUntil ?? 0;
  const access = { role, validUntil };
  const entry = changeAccess(
    me.signer,
    vault.log,
    vault.ring.vaultId,
    accountId,
    access,
    timeFor(vault),
  );
  return outcome(await api.appendLog(me.token, entry));
};

export const removeFromVault = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  accountId: Uint8Array,
): Promise<Changed> => {
  const me = signerOf(session);
  if (!me) return { ok: false, error: "locked" };
  const entry = removeMember(me.signer, vault.log, vault.ring.vaultId, accountId, timeFor(vault));
  return outcome(await api.appendLog(me.token, entry));
};
