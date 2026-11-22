/**
 * Company recovery on the client (K-307 part c, P-13). Every account keeps its deposit current under
 * the policy in force: to the key the root-signed policy names and to no other, whatever key the
 * server serves (depositFor). Owners make the recovery key, a new one when an owner leaves, or
 * switch recovery off; each is a new policy signed with the root key, so the server can neither
 * name its own key nor switch recovery back on.
 *
 * Like the owner-held organization key of Bitwarden's account recovery and Passbolt's recovery
 * contacts, the private half lives only wrapped to the owners; unlike there, every step is checked
 * by the clients against the policy the company root signed.
 */
import {
  type CompanyRecoveryKey,
  checkMembers,
  depositFor,
  encodeBytes,
  grantRecoveryKey,
  type MemberView,
  newCompanyRecoveryKey,
  openRecoveryGrant,
  type RecoveryGrantError,
  recoveryPolicy,
} from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import type { MembersApi } from "../session/members-api.ts";
import type { Opened } from "../session/open-account.ts";
import type { RecoveryApi } from "../session/recovery-api.ts";
import {
  applyPolicy,
  type LoadPolicyError,
  loadCompanyPolicy,
  loadPolicy,
  type PolicyAccount,
  type PolicyDeps,
} from "./policy.ts";

export type RecoveryDeps = PolicyDeps & Pick<MembersApi, "members"> & RecoveryApi;

/**
 * - off: the policy has company recovery off; other-key: the server serves no key or one the
 *   policy does not name, so nothing is deposited; kept: the server holds this account's deposit
 *   for the key in force; deposited: deposited just now; unreachable, invalid: no valid policy
 */
export type DepositStatus = "off" | "other-key" | "kept" | "deposited" | "unreachable" | "invalid";

export const keepDeposit = async (
  api: Pick<RecoveryDeps, "company" | "heldDeposit" | "saveDeposit">,
  opened: Opened,
): Promise<DepositStatus> => {
  const loaded = await loadCompanyPolicy(api, opened);
  if (!loaded.ok) return loaded.error === "unreachable" ? "unreachable" : "invalid";
  const { policy, recoveryPublicKey } = loaded.value;
  const held = policy.companyRecovery.enabled ? await api.heldDeposit(opened.token) : undefined;
  const decided = depositFor(policy, recoveryPublicKey, held, opened);
  if (decided.kind !== "deposit") return decided.kind;
  return (await api.saveDeposit(opened.token, decided.deposit)) ? "deposited" : "unreachable";
};

/** The owners the root certified and who are still in the company: each gets the key wrapped */
const certifiedOwners = (views: MemberView[]) =>
  views.flatMap((v) =>
    v.role === "owner" && v.status === "certified" && v.leftAt == null && v.certificate
      ? [v.certificate]
      : [],
  );

/**
 * An owner makes a recovery key: on for the first time, or new when an owner left (the old one
 * then held every deposit). Wrapped to every certified owner, named in the next signed policy;
 * then this account deposits to it at once.
 */
export const makeRecoveryKey = async (api: RecoveryDeps, session: PolicyAccount) => {
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root) return false;
  const [current, members] = await Promise.all([
    loadPolicy(api, opened),
    api.members(opened.token),
  ]);
  if (!current.ok || !members) return false;
  const rootPublicKey = ed25519KeyPair(root).publicKey;
  const owners = certifiedOwners(checkMembers(rootPublicKey, members, opened.state.certificates));
  const me = encodeBytes(opened.accountId);
  if (!owners.some((c) => encodeBytes(c.accountId) === me)) return false;
  const key = newCompanyRecoveryKey();
  const grants = owners.map((c) => ({
    accountId: c.accountId,
    grant: grantRecoveryKey(key.secretKey, c),
  }));
  const policy = recoveryPolicy(root, current.value, key.fingerprint);
  if (!(await api.saveRecoveryKey(opened.token, policy, key.publicKey, grants))) return false;
  if (!(await applyPolicy(api, session)).ok) return false;
  const now = session.opened();
  return now !== undefined && (await keepDeposit(api, now)) === "deposited";
};

/** An owner switches company recovery off: the server then drops the key and every deposit */
export const switchRecoveryOff = async (api: RecoveryDeps, session: PolicyAccount) => {
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root) return false;
  const current = await loadPolicy(api, opened);
  if (!current.ok) return false;
  if (!(await api.savePolicy(opened.token, recoveryPolicy(root, current.value, undefined))))
    return false;
  return (await applyPolicy(api, session)).ok;
};

export type OwnKeyError = "off" | "none" | RecoveryGrantError | LoadPolicyError;

/** The recovery key wrapped to this owner, taken only with the fingerprint the valid policy names */
export const ownRecoveryKey = async (
  api: Pick<RecoveryDeps, "company" | "recoveryGrant">,
  opened: Opened,
): Promise<{ ok: true; value: CompanyRecoveryKey } | { ok: false; error: OwnKeyError }> => {
  const current = await loadPolicy(api, opened);
  if (!current.ok) return current;
  const { companyRecovery, companyId } = current.value;
  if (!companyRecovery.enabled) return { ok: false, error: "off" };
  const grant = await api.recoveryGrant(opened.token);
  if (!grant) return { ok: false, error: "none" };
  const { keyBlock, accountId } = opened;
  return openRecoveryGrant(keyBlock, accountId, companyId, grant, companyRecovery.fingerprint);
};
