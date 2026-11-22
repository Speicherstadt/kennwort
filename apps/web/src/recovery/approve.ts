/**
 * The owner's side of company recovery (K-307 part c, P-13). The member's new device shows the
 * pairing link (P-04); the owner's client checks the device's key against the link's fingerprint,
 * opens its own grant of the recovery key (only with the fingerprint of the policy in force), checks
 * the member's deposit (signature, commitment, key block, root) and wraps the member's AK to the new
 * device. Both show the comparison code; confirming signs a "recovery" event into the audit log
 * (P-20) and only then gives the device a session for the member.
 */
import { ownRecoveryKey, type RecoveryDeps } from "@kennwort/client/policy/recovery.ts";
import type { PairingApi } from "@kennwort/client/session/pairing-api.ts";
import { approveRecovery, encodeBytes, type MemberView, signAudit } from "@kennwort/core";
import { constantTimeEqual, deviceCode, deviceFingerprint } from "@kennwort/crypto";
import type { PairingLink } from "../pairing/link.ts";
import type { Opened } from "../session/session.ts";

export type ApproveDeps = Pick<PairingApi, "pairingKey" | "confirmPairing"> &
  Pick<
    RecoveryDeps,
    "company" | "recoveryGrant" | "memberRecovery" | "answerRecovery" | "auditAction"
  >;

/**
 * - gone: the pairing ran out or was answered; other-key: the server swapped the device's key
 * - no-key: this owner holds no recovery key the policy names; no-deposit: the member has none
 * - refused: the deposit does not check out (made by the server, for an earlier key, another root)
 */
export type ApproveError = "gone" | "other-key" | "no-key" | "no-deposit" | "refused";

export const approveMember = async (
  api: ApproveDeps,
  opened: Opened,
  member: MemberView,
  link: PairingLink,
): Promise<{ ok: true; code: string } | { ok: false; error: ApproveError }> => {
  const publicKey = await api.pairingKey(opened.token, link.id);
  if (!publicKey) return { ok: false, error: "gone" };
  if (!constantTimeEqual(deviceFingerprint(publicKey), link.fingerprint))
    return { ok: false, error: "other-key" };
  const recoveryKey = await ownRecoveryKey(api, opened);
  if (!recoveryKey.ok) return { ok: false, error: "no-key" };
  // Only a member the pinned root certified: its certificate is what the deposit is checked against
  if (member.status !== "certified" || !member.certificate) return { ok: false, error: "refused" };
  const bundle = await api.memberRecovery(opened.token, member.accountId);
  if (!bundle) return { ok: false, error: "no-deposit" };
  const approved = approveRecovery({
    recoveryKey: recoveryKey.value,
    bundle,
    certificate: member.certificate,
    rootFingerprint: opened.state.rootFingerprint,
    device: { publicKey, pairingSecret: link.secret },
  });
  if (!approved.ok) return { ok: false, error: "refused" };
  const answered = await api.answerRecovery(
    opened.token,
    link.id,
    approved.value,
    member.accountId,
  );
  return answered
    ? { ok: true, code: deviceCode(publicKey, approved.value) }
    : { ok: false, error: "gone" };
};

/** After the codes matched: the recovery signed into the audit log, then the confirmation */
export const confirmRecovery = async (
  api: ApproveDeps,
  opened: Opened,
  member: MemberView,
  link: PairingLink,
) => {
  const companyId = member.certificate?.companyId;
  if (!companyId) return false;
  const event = {
    companyId: encodeBytes(companyId),
    actor: encodeBytes(opened.accountId),
    action: "recovery" as const,
    subject: `${encodeBytes(member.accountId)}/${link.id}`,
  };
  const signature = signAudit(opened.keyBlock.ed.secretKey, event);
  if (!(await api.auditAction(opened.token, event.action, event.subject, signature))) return false;
  return api.confirmPairing(opened.token, link.id);
};
