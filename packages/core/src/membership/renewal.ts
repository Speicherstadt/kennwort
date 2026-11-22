/**
 * A member's renewed keys in a vault's log (P-12, K-307 part e): a `rekey` entry names the member's
 * new bundle with the same role and time limit, signed by the member with the new keys or by a
 * manager. Like an exit followed by a return (remove and add, P-11) in one step, so a vault whose
 * only manager renews her keys never stands without one. The rotation that follows (rotation.ts)
 * wraps the next vault key to the new bundle only; the old keys open nothing written after it.
 */
import { err, ok, type Result } from "../result.ts";
import { type Certificate, certificateFingerprint } from "./certificate.ts";
import { type LogEntry, signEntry } from "./log-entry.ts";
import { nextLink, type Signer } from "./vault-ops.ts";
import { certificateOf, idKey, type LogState, type Trust } from "./verify-log.ts";

/** The `rekey` entry for a member whose renewed bundle the root certified */
export const rekeyMember = (
  signer: Signer,
  state: LogState,
  vaultId: Uint8Array,
  renewed: Certificate,
  time: number,
): Result<LogEntry, "not-member"> => {
  const member = state.members.get(idKey(renewed.accountId));
  if (!member) return err("not-member");
  return ok(
    signEntry(signer.edSecretKey, {
      vaultId,
      ...nextLink(state),
      epoch: state.epoch,
      action: "rekey",
      accountId: renewed.accountId,
      fingerprint: certificateFingerprint(renewed),
      role: member.role,
      validUntil: member.validUntil,
      vkCommitment: new Uint8Array(),
      time,
      signerId: signer.accountId,
    }),
  );
};

/**
 * The renewed certificates a vault's log does not name yet: one rekey entry is due for each. A
 * member whose new bundle still waits for its certificate is not among them; until it comes, the
 * vault stays without writes (LogState.superseded).
 */
export const dueRekeys = (state: LogState, trust: Trust): Certificate[] =>
  state.superseded.flatMap((key) => {
    const listed = trust.certificates.get(key);
    const certificate = listed && certificateOf(trust, listed.accountId);
    return certificate && idKey(certificate.accountId) === key ? [certificate] : [];
  });
