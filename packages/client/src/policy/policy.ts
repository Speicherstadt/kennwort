/**
 * The company policy on the client (K-304, F-07): loaded with the company, checked under the pinned
 * root and against the newest version this account has seen, then applied (the lock time). Owners
 * sign a new version with the root key. A policy that does not check out changes nothing.
 */
import {
  bytes,
  checkPolicy,
  encodeBytes,
  type PolicyError,
  signPolicy,
  trustedRoot,
  type UnsignedPolicy,
} from "@kennwort/core";
import type { MembersApi } from "../session/members-api.ts";
import type { OpenAccount, Opened } from "../session/open-account.ts";
import type { PolicyApi } from "../session/policy-api.ts";
import type { StateDeps } from "../session/state-sync.ts";

/** The open account and its automatic lock, which the policy sets */
export type PolicyAccount = OpenAccount & { setLockAfter: (ms: number) => void };

export type PolicyDeps = Pick<MembersApi, "company"> & PolicyApi & StateDeps;
export type LoadPolicyError = "unreachable" | "root-mismatch" | PolicyError;

/**
 * The policy checked under the pinned root, with the recovery key's public half the server serves
 * beside it; that key counts only where the policy names its fingerprint (K-307 part c)
 */
export const loadCompanyPolicy = async (
  api: Pick<PolicyDeps, "company">,
  opened: Opened,
): Promise<
  | { ok: true; value: { policy: UnsignedPolicy; recoveryPublicKey: Uint8Array | null } }
  | { ok: false; error: LoadPolicyError }
> => {
  const company = await api.company(opened.token);
  const companyId = bytes(16).safeParse(company?.id);
  if (!company || !companyId.success) return { ok: false, error: "unreachable" };
  const root = trustedRoot(opened.state.rootFingerprint, company.rootPublicKey);
  if (!root) return { ok: false, error: "root-mismatch" };
  const checked = checkPolicy(root, companyId.data, opened.state.policy, company.policy);
  return checked.ok
    ? { ok: true, value: { policy: checked.value, recoveryPublicKey: company.recoveryPublicKey } }
    : checked;
};

export const loadPolicy = async (
  api: Pick<PolicyDeps, "company">,
  opened: Opened,
): Promise<{ ok: true; value: UnsignedPolicy } | { ok: false; error: LoadPolicyError }> => {
  const loaded = await loadCompanyPolicy(api, opened);
  return loaded.ok ? { ok: true, value: loaded.value.policy } : loaded;
};

const MINUTE = 60_000;

/**
 * The policy in force: the lock time from a valid policy, its version and lock time remembered for
 * every device; when the check fails or the server is away, the last valid one stays (P-07)
 */
export const applyPolicy = async (api: PolicyDeps, session: PolicyAccount) => {
  const opened = session.opened();
  if (!opened) return { ok: false as const, error: "unreachable" as const };
  const loaded = await loadPolicy(api, opened);
  // Locked or another account opened while it loaded: this policy is not that account's. The same
  // account under a newer state (a sync, a new token) is still it
  const now = session.opened();
  if (!now || encodeBytes(now.accountId) !== encodeBytes(opened.accountId))
    return { ok: false as const, error: "unreachable" as const };
  // A newer policy applied while this one loaded (an owner's save) wins: its lock time is in the
  // account state by now, so a slower, older answer or a failed load falls back to that one
  const current = loaded.ok && loaded.value.version >= now.state.policy;
  const minutes = current ? loaded.value.lockAfterMinutes : now.state.policyLock;
  session.setLockAfter(minutes * MINUTE);
  if (!loaded.ok) return loaded;
  if (!current) return { ok: false as const, error: "older" as const };
  const { version } = loaded.value;
  if (version > opened.state.policy)
    await session.updateState(api, (state) =>
      version > state.policy ? { ...state, policy: version, policyLock: minutes } : undefined,
    );
  return loaded;
};

/** An owner's new lock time: the next version, signed with the root key, then applied here */
export const saveLockTime = async (api: PolicyDeps, session: PolicyAccount, minutes: number) => {
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root) return false;
  const current = await loadPolicy(api, opened);
  if (!current.ok) return false;
  const policy = signPolicy(root, {
    ...current.value,
    version: current.value.version + 1,
    lockAfterMinutes: minutes,
  });
  if (!(await api.savePolicy(opened.token, policy))) return false;
  return (await applyPolicy(api, session)).ok;
};
