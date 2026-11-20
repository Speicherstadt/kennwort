/**
 * The members page's work (K-304, P-07, P-08), without any interface: load and check the list,
 * invite someone, confirm a pending member. The server's list counts only as far as the pinned
 * root key confirms it; a confirmation is remembered in the account state before it is uploaded,
 * so one invitation makes one member even if the upload fails and is tried again.
 */
import {
  type AccountState,
  type Certificate,
  certifyInvited,
  checkMembers,
  encodeBytes,
  type MemberView,
  newInvitation,
  type PendingMember,
  trustedRoot,
} from "@kennwort/core";
import { bundleFingerprint, constantTimeEqual } from "@kennwort/crypto";
import type { MembersApi } from "../session/members-api.ts";
import type { Opened, Session } from "../session/session.ts";
import type { StateDeps } from "../session/state-sync.ts";

export type MembersDeps = MembersApi & StateDeps;

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
  const views = checkMembers(root, members);
  return { ok: true, value: { views, me: views.find((v) => same(v.accountId, opened.accountId)) } };
};

/** Owners and admins invite, once the root key confirms their own role */
export const mayInvite = (me: MemberView | undefined) =>
  me?.status === "certified" && (me.role === "owner" || me.role === "admin");

/** Confirming needs the root key and a certificate of one's own (it names the company) */
export const mayConfirm = (opened: Opened, me: MemberView | undefined) =>
  opened.state.rootSecretKey !== undefined && me?.status === "certified";

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
