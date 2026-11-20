/**
 * The company policy on the client (K-304, F-07): loaded with the company, checked under the pinned
 * root and against the newest version this account has seen, then applied (the lock time). Owners
 * sign a new version with the root key. A policy that does not check out changes nothing.
 */
import {
  bytes,
  checkPolicy,
  type PolicyError,
  signPolicy,
  trustedRoot,
  type UnsignedPolicy,
} from "@kennwort/core";
import type { MembersApi } from "../session/members-api.ts";
import type { PolicyApi } from "../session/policy-api.ts";
import type { Opened, Session } from "../session/session.ts";
import type { StateDeps } from "../session/state-sync.ts";

export type PolicyDeps = Pick<MembersApi, "company"> & PolicyApi & StateDeps;
export type LoadPolicyError = "unreachable" | "root-mismatch" | PolicyError;

export const loadPolicy = async (
  api: PolicyDeps,
  opened: Opened,
): Promise<{ ok: true; value: UnsignedPolicy } | { ok: false; error: LoadPolicyError }> => {
  const company = await api.company(opened.token);
  const companyId = bytes(16).safeParse(company?.id);
  if (!company || !companyId.success) return { ok: false, error: "unreachable" };
  const root = trustedRoot(opened.state.rootFingerprint, company.rootPublicKey);
  if (!root) return { ok: false, error: "root-mismatch" };
  return checkPolicy(root, companyId.data, opened.state.policy, company.policy);
};

const MINUTE = 60_000;

/** The policy in force: the lock time from it, and its version remembered for every device */
export const applyPolicy = async (api: PolicyDeps, session: Session) => {
  const opened = session.opened();
  if (!opened) return { ok: false as const, error: "unreachable" as const };
  const loaded = await loadPolicy(api, opened);
  if (!loaded.ok) return loaded;
  const policy = loaded.value;
  session.setLockAfter(policy.lockAfterMinutes * MINUTE);
  if (policy.version > opened.state.policy)
    await session.updateState(api, (state) =>
      policy.version > state.policy ? { ...state, policy: policy.version } : undefined,
    );
  return loaded;
};

/** An owner's new lock time: the next version, signed with the root key, then applied here */
export const saveLockTime = async (api: PolicyDeps, session: Session, minutes: number) => {
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
