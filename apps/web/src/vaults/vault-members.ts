/**
 * The members of one vault (K-305 part 3, P-05): who is in it by its checked log, whom a manager
 * can add (only accounts the pinned root certified), and the signed entries for adding and changing
 * a role; removing comes with a key rotation (exit.ts). The server takes an entry only as the next
 * link of the chain; when another device wrote first it answers stale, and the page loads the vault
 * again before trying anew.
 */

import type { Appended } from "@kennwort/client/session/vaults-api.ts";
import type { Vault, VaultDeps } from "@kennwort/client/vaults/vaults.ts";
import {
  addMember,
  bytes,
  type Certificate,
  changeAccess,
  idKey,
  type MemberView,
  type VaultRole,
} from "@kennwort/core";
import type { Session } from "../session/session.ts";

export type VaultMember = {
  accountId: Uint8Array;
  name: string | null;
  role: VaultRole;
  validUntil: number;
  me: boolean;
};

export type ChangeError = Exclude<Appended, "ok"> | "locked" | "past";
type Changed = { ok: true } | { ok: false; error: ChangeError };

/** The account ID back from the log's key (idKey: hex) */
export const fromIdKey = (key: string) =>
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

/** A new member with a role, until a time in Unix seconds (0: no end) */
export const addToVault = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  person: Certificate,
  role: VaultRole,
  validUntil = 0,
): Promise<Changed> => {
  const me = signerOf(session);
  if (!me) return { ok: false, error: "locked" };
  // A time limit already over would add someone who can never open the vault (review of K-305)
  if (hasExpired({ validUntil })) return { ok: false, error: "past" };
  const access = { role, validUntil };
  const made = addMember(me.signer, vault.log, vault.ring, person, access, timeFor(vault));
  return outcome(await api.appendLog(me.token, made.entry, made.wrappedKey));
};

const changeAccessOf = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  accountId: Uint8Array,
  access: { role: VaultRole; validUntil: number },
): Promise<Changed> => {
  const me = signerOf(session);
  if (!me) return { ok: false, error: "locked" };
  const time = timeFor(vault);
  const entry = changeAccess(me.signer, vault.log, vault.ring.vaultId, accountId, access, time);
  return outcome(await api.appendLog(me.token, entry));
};

/** Another role; a time limit the member has stays (review of K-305) */
export const changeVaultRole = (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  accountId: Uint8Array,
  role: VaultRole,
): Promise<Changed> => {
  const validUntil = vault.log.members.get(idKey(accountId))?.validUntil ?? 0;
  return changeAccessOf(api, session, vault, accountId, { role, validUntil });
};

/** Whether a member's time has run out, by this device's clock */
export const hasExpired = (member: { validUntil: number }, now = Math.floor(Date.now() / 1000)) =>
  member.validUntil !== 0 && member.validUntil <= now;

export type Request = {
  accountId: Uint8Array;
  name: string | null;
  requestedAt: number;
  /** The certificate the pinned root confirmed; without one the request cannot be granted */
  certificate: Certificate | undefined;
  /** In the log already, but their time ran out: granting renews their access */
  expired: boolean;
  /** The role a linked group asks them in with, if a group filed or backs the request */
  role: VaultRole | null;
};

/** The vault's open requests with what the members list confirms about who asked */
export const loadRequests = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  people: MemberView[],
): Promise<Request[] | undefined> => {
  const opened = session.opened();
  if (!opened || !mayManage(vault)) return undefined;
  const requests = await api.vaultRequests(opened.token, vault.ring.vaultId);
  // A current member's request is answered; one whose time ran out may ask again (review of K-305)
  const current = (request: { accountId: Uint8Array }) => {
    const member = vault.log.members.get(idKey(request.accountId));
    return member !== undefined && !hasExpired(member);
  };
  return requests
    ?.filter((request) => !current(request))
    .map((request) => {
      const person = people.find((p) => idKey(p.accountId) === idKey(request.accountId));
      return {
        accountId: request.accountId,
        name: person?.name ?? null,
        requestedAt: request.requestedAt,
        certificate: person?.status === "certified" ? person.certificate : undefined,
        expired: vault.log.members.has(idKey(request.accountId)),
        role: request.role,
      };
    });
};

/**
 * Grants a request: a new member is added; a member whose time ran out keeps their entry in the
 * log and gets a role change without an end, since adding them again is no valid entry
 */
export const grantRequest = (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  request: Request & { certificate: Certificate },
  role: VaultRole,
): Promise<Changed> =>
  request.expired
    ? changeAccessOf(api, session, vault, request.accountId, { role, validUntil: 0 })
    : addToVault(api, session, vault, request.certificate, role);

export const declineRequest = async (
  api: VaultDeps,
  session: Session,
  vault: Vault,
  accountId: Uint8Array,
): Promise<Changed> => {
  const opened = session.opened();
  if (!opened) return { ok: false, error: "locked" };
  const done = await api.dropRequest(opened.token, vault.ring.vaultId, accountId);
  return done ? { ok: true } : { ok: false, error: "unreachable" };
};

/** A vault ID from a link: 16 bytes in base64url, or none (the demo's names are none) */
export const vaultIdOf = (text: string) => {
  const parsed = bytes(16).safeParse(text);
  return parsed.success ? parsed.data : undefined;
};

/** Asks the vault's managers for access (P-05 step 4); the server only keeps the request */
export const requestAccess = async (api: VaultDeps, session: Session, vaultId: Uint8Array) => {
  const opened = session.opened();
  return opened ? api.requestAccess(opened.token, vaultId) : false;
};
