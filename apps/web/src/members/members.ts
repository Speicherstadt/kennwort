/**
 * The members page's work (K-304, P-07, P-08), without any interface: load and check the list,
 * invite someone, confirm a pending member. The server's list counts only as far as the pinned
 * root key confirms it; a confirmation is remembered in the account state before it is uploaded,
 * so one invitation makes one member even if the upload fails and is tried again.
 */

import type { MembersApi } from "@kennwort/client/session/members-api.ts";
import type { PolicyApi } from "@kennwort/client/session/policy-api.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import {
  type AccountState,
  type Certificate,
  type CompanyRole,
  certifyInvited,
  changeRole,
  checkMembers,
  encodeBytes,
  type MemberView,
  newerCertificates,
  newInvitation,
  openRootGrant,
  type PendingMember,
  trustedRoot,
} from "@kennwort/core";
import { bundleFingerprint, constantTimeEqual } from "@kennwort/crypto";
import type { Opened, Session } from "../session/session.ts";

export type MembersDeps = MembersApi & PolicyApi & StateDeps;

export type Loaded = { views: MemberView[]; me: MemberView | undefined };
export type LoadError = "unreachable" | "root-mismatch";

const same = (a: Uint8Array, b: Uint8Array) => encodeBytes(a) === encodeBytes(b);

export const loadMembers = async (
  api: MembersDeps,
  opened: Opened,
): Promise<{ ok: true; value: Loaded } | { ok: false; error: LoadError }> => {
  const [company, members] = await Promise.all([
    api.company(opened.token),
    api.members(opened.token),
  ]);
  if (!company || !members) return { ok: false, error: "unreachable" };
  const root = trustedRoot(opened.state.rootFingerprint, company.rootPublicKey);
  if (!root) return { ok: false, error: "root-mismatch" };
  const views = checkMembers(root, members, opened.state.certificates);
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
  const id = encodeBytes(certificate.accountId);
  const remembered = await session.updateState(api, (state) => ({
    ...state,
    certificates: { ...state.certificates, [id]: certificate.issuedAt },
  }));
  return remembered.ok && (await api.changeRole(opened.token, certificate, rootGrant));
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
