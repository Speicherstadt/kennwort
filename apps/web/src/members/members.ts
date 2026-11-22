/**
 * The members page's work (K-304, P-07, P-08), without any interface: load and check the list,
 * invite someone, confirm a pending member. The server's list counts only as far as the pinned
 * root key confirms it; a confirmation is remembered in the account state before it is uploaded,
 * so one invitation makes one member even if the upload fails and is tried again.
 */

import { loadPolicy } from "@kennwort/client/policy/policy.ts";
import { makeRecoveryKey, ownRecoveryKey } from "@kennwort/client/policy/recovery.ts";
import { replaceRoot } from "@kennwort/client/root/root-change.ts";
import type { MembersApi } from "@kennwort/client/session/members-api.ts";
import type { PolicyApi } from "@kennwort/client/session/policy-api.ts";
import type { RecoveryApi } from "@kennwort/client/session/recovery-api.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import {
  type AccountState,
  bytes,
  type Certificate,
  type CompanyRole,
  certifyInvited,
  changeRole,
  checkMembers,
  encodeBytes,
  grantRecoveryKey,
  type MemberView,
  newerCertificates,
  newInvitation,
  openRootGrant,
  type PendingMember,
  rootOf,
} from "@kennwort/core";
import {
  bundleFingerprint,
  comparisonCode,
  constantTimeEqual,
  type RootChange,
} from "@kennwort/crypto";
import type { Opened, Session } from "../session/session.ts";

export type MembersDeps = MembersApi & PolicyApi & StateDeps & RecoveryApi;

export type Loaded = { views: MemberView[]; me: MemberView | undefined };
export type LoadError = "unreachable" | "root-mismatch" | "root-fork" | "root-retired";
/** A new company root waits for this person to compare its code with an owner (P-07) */
export type PendingRoot = { changes: RootChange[]; code: string };
export type LoadFailure =
  | { ok: false; error: LoadError }
  | { ok: false; error: "root-change"; pending: PendingRoot };

const same = (a: Uint8Array, b: Uint8Array) => encodeBytes(a) === encodeBytes(b);

const seconds = () => Math.floor(Date.now() / 1000);

/**
 * The list under the pinned root and the roots this account replaced; a new root the server serves
 * comes back as waiting for the person, never as trusted (P-07, K-307 part f)
 */
export const loadMembers = async (
  api: MembersDeps,
  opened: Opened,
): Promise<{ ok: true; value: Loaded } | LoadFailure> => {
  const [company, members] = await Promise.all([
    api.company(opened.token),
    api.members(opened.token),
  ]);
  const companyId = bytes(16).safeParse(company?.id);
  if (!company || !members || !companyId.success) return { ok: false, error: "unreachable" };
  const root = rootOf(opened.state, { ...company, companyId: companyId.data }, seconds());
  if (root.kind === "change")
    return {
      ok: false,
      error: "root-change",
      pending: { changes: root.changes, code: comparisonCode(root.fingerprint) },
    };
  if (root.kind === "refused") return { ok: false, error: root.error };
  const { certificates, retiredRoots } = opened.state;
  const views = checkMembers(root.root, members, certificates, retiredRoots);
  return { ok: true, value: { views, me: views.find((v) => same(v.accountId, opened.accountId)) } };
};

/** Owners and admins invite, once the root key confirms their own role */
export const mayInvite = (me: MemberView | undefined) =>
  me?.status === "certified" && (me.role === "owner" || me.role === "admin");

/** Confirming needs the root key and an owner's or admin's certificate (it names the company) */
export const mayConfirm = (opened: Opened, me: MemberView | undefined) =>
  opened.state.rootSecretKey !== undefined && mayInvite(me);

/**
 * Who may make an account leave the company, as the server allows it (K-307): owners anyone else,
 * admins only members, nobody themselves, and nobody who left already
 */
export const mayRemove = (me: MemberView | undefined, view: MemberView) =>
  mayInvite(me) &&
  encodeBytes(view.accountId) !== encodeBytes((me as MemberView).accountId) &&
  view.leftAt == null &&
  (me?.role === "owner" || view.role === "member");

/** Only owners give roles, with the root key at hand */
export const mayChangeRoles = (opened: Opened, me: MemberView | undefined) =>
  mayConfirm(opened, me) && me?.role === "owner";

/** An owner or admin without the root key yet: an owner may have wrapped it to this account */
export const needsRoot = (opened: Opened, me: MemberView | undefined) =>
  opened.state.rootSecretKey === undefined && mayInvite(me);

export type AdoptError = "none" | "not-authentic" | "other-root" | "failed";

/**
 * Takes the root key an owner wrapped to this account, only if it is the root this account pinned
 * (openRootGrant), and keeps it in the account state for every device of the account (P-07)
 */
export const adoptRoot = async (
  api: MembersDeps,
  session: Session,
  me: MemberView | undefined,
): Promise<{ ok: true } | { ok: false; error: AdoptError }> => {
  const opened = session.opened();
  const company = me?.certificate?.companyId;
  if (!opened || !company) return { ok: false, error: "failed" };
  const grant = await api.rootGrant(opened.token);
  if (!grant) return { ok: false, error: "none" };
  const root = openRootGrant(opened.keyBlock, opened.accountId, company, grant);
  if (!root.ok) return root;
  const saved = await session.updateState(api, (state) => ({
    ...state,
    rootSecretKey: root.value,
  }));
  return saved.ok ? { ok: true } : { ok: false, error: "failed" };
};

/** Remembers the newest certificate seen per account, so an older one played back does not count */
export const rememberCertificates = (api: MembersDeps, session: Session, views: MemberView[]) =>
  session.updateState(api, (state) => {
    const newer = newerCertificates(views, state.certificates);
    return newer ? { ...state, certificates: newer } : undefined;
  });

/**
 * An owner left or is an owner no more (K-307 part c): it held the recovery key and with it every
 * deposit, so while company recovery is on, a remaining owner makes a new key and everyone deposits
 * anew (P-13)
 */
export const afterOwnerLeft = async (api: MembersDeps, session: Session) => {
  const opened = session.opened();
  if (!opened) return false;
  const policy = await loadPolicy(api, opened);
  if (!policy.ok || !policy.value.companyRecovery.enabled) return policy.ok;
  return makeRecoveryKey(api, session);
};

/**
 * An owner or admin left or became a member (K-307 part f): they kept a copy of the root, so this
 * owner's client replaces it (P-07); the members take the new one once they compared its code
 */
const afterManagerLeft = async (api: MembersDeps, session: Session) =>
  (await replaceRoot(api, session)).ok;

/**
 * The account leaves the company; an owner or admin who left held the root: a new one, and an owner
 * held the recovery key as well: a new one too (P-07, P-13)
 */
export const leaveCompany = async (
  api: MembersDeps,
  session: Session,
  accountId: Uint8Array,
  views: MemberView[],
) => {
  const opened = session.opened();
  if (!opened || !(await api.leave(opened.token, accountId))) return false;
  const id = encodeBytes(accountId);
  const role = views.find((v) => encodeBytes(v.accountId) === id)?.role;
  if (role !== "member" && role !== undefined && !(await afterManagerLeft(api, session)))
    return false;
  if (role === "owner") await afterOwnerLeft(api, session);
  return true;
};

/** A new owner gets the recovery key too, while company recovery is on; undefined when it is off */
const recoveryGrantFor = async (api: MembersDeps, opened: Opened, certificate: Certificate) => {
  if (certificate.role !== "owner") return { ok: true as const, grant: undefined };
  const own = await ownRecoveryKey(api, opened);
  if (own.ok)
    return { ok: true as const, grant: grantRecoveryKey(own.value.secretKey, certificate) };
  return { ok: own.error === "off", grant: undefined };
};

/**
 * An owner gives another certified member a new role (root-grant.ts); the new certificate is
 * remembered before it is uploaded, so the old role never counts again on this account's devices
 */
export const setRole = async (
  api: MembersDeps,
  session: Session,
  view: MemberView,
  role: CompanyRole,
) => {
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root || !view.certificate) return false;
  const { certificate, rootGrant } = changeRole(root, view.certificate, role);
  const recovery = await recoveryGrantFor(api, opened, certificate);
  if (!recovery.ok) return false;
  const id = encodeBytes(certificate.accountId);
  const remembered = await session.updateState(api, (state) => ({
    ...state,
    certificates: { ...state.certificates, [id]: certificate.issuedAt },
  }));
  const saved =
    remembered.ok && (await api.changeRole(opened.token, certificate, rootGrant, recovery.grant));
  if (!saved) return false;
  // Whoever loses the root with the new role still has a copy of it (P-07)
  if (view.role !== "member" && role === "member" && !(await afterManagerLeft(api, session)))
    return false;
  if (view.role !== "owner" || role === "owner") return true;
  return afterOwnerLeft(api, session);
};

/** The link's fragment never reaches the server: the secret and the pinned root fingerprint */
export const invitationLink = (
  origin: string,
  id: Uint8Array,
  token: string,
  secret: Uint8Array,
  rootFingerprint: Uint8Array,
) =>
  `${origin}/invite/${encodeBytes(id)}#token=${encodeURIComponent(token)}` +
  `&s=${encodeBytes(secret)}&root=${encodeBytes(rootFingerprint)}`;

export const invite = async (api: MembersDeps, opened: Opened, label: string, origin: string) => {
  const invitation = newInvitation(opened.accountKey, opened.accountId);
  const made = await api.invite(opened.token, invitation, label);
  return made
    ? invitationLink(
        origin,
        invitation.id,
        made.token,
        invitation.secret,
        opened.state.rootFingerprint,
      )
    : undefined;
};

export type ConfirmError =
  | "mac-mismatch"
  | "used"
  | "not-mine"
  | "no-root"
  | "other-keys"
  | "failed";

type Checked = { ok: true; value: Certificate } | { ok: false; error: ConfirmError };

/**
 * The check against the merged state, not this device's copy: another device of the same admin may
 * have certified the invitation for someone else meanwhile, or know other keys for the account
 * (review of K-304). A refusal writes nothing.
 */
const certifyAgainst = (
  opened: Opened,
  company: Uint8Array,
  pending: PendingMember,
  state: AccountState,
): Checked => {
  const known = state.bundles[encodeBytes(pending.accountId)];
  const fingerprint = bundleFingerprint(pending.xwingPublicKey, pending.edPublicKey);
  if (known && !constantTimeEqual(known, fingerprint)) return { ok: false, error: "other-keys" };
  return certifyInvited(
    {
      accountKey: opened.accountKey,
      accountId: opened.accountId,
      companyId: company,
      rootSecretKey: state.rootSecretKey,
      certified: state.invitations,
    },
    pending,
  );
};

const remembering = (state: AccountState, pending: PendingMember): AccountState => {
  const member = encodeBytes(pending.accountId);
  return {
    ...state,
    invitations: { ...state.invitations, [encodeBytes(pending.invitation.id)]: member },
    bundles: {
      ...state.bundles,
      [member]: bundleFingerprint(pending.xwingPublicKey, pending.edPublicKey),
    },
  };
};

export const confirm = async (
  api: MembersDeps,
  session: Session,
  view: MemberView,
  me: MemberView | undefined,
): Promise<{ ok: true } | { ok: false; error: ConfirmError }> => {
  const opened = session.opened();
  const company = me?.certificate?.companyId;
  const pending = view.pending;
  if (!opened || !pending || !company) return { ok: false, error: "failed" };
  let checked: Checked | undefined;
  const remembered = await session.updateState(api, (state) => {
    checked = certifyAgainst(opened, company, pending, state);
    return checked.ok ? remembering(state, pending) : undefined;
  });
  if (checked && !checked.ok) return checked;
  if (!remembered.ok || !checked) return { ok: false, error: "failed" };
  return (await api.certify(opened.token, checked.value))
    ? { ok: true }
    : { ok: false, error: "failed" };
};
