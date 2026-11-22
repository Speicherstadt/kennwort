/**
 * A new company root key on the client (K-307 part f, P-07), without any interface: what the
 * client makes of the root the server serves, the person's confirmation of a change, and an owner
 * replacing the root. A confirmed change goes into the account state, so every device of the
 * account follows it, and into the key block under AK, so every way to open the account knows it.
 */
import {
  type AccountState,
  acceptRootChange,
  bytes,
  type Certificate,
  checkMembers,
  checkPolicy,
  encodeBytes,
  followRoot,
  type RootView,
  rootOf,
  rotateRoot,
} from "@kennwort/core";
import { comparisonCode, type RootChange, rootFingerprint, sealKeyBlock } from "@kennwort/crypto";
import type { MembersApi } from "../session/members-api.ts";
import type { OpenAccount, Opened } from "../session/open-account.ts";
import type { StateDeps } from "../session/state-sync.ts";

export type RootDeps = Pick<MembersApi, "company" | "members" | "replaceRoot" | "writeKeyBlock"> &
  StateDeps;

const seconds = () => Math.floor(Date.now() / 1000);

/** The company as served, with its ID as bytes; undefined when the server is away */
const companyOf = async (api: Pick<RootDeps, "company">, opened: Opened) => {
  const company = await api.company(opened.token);
  const companyId = bytes(16).safeParse(company?.id);
  return company && companyId.success ? { ...company, companyId: companyId.data } : undefined;
};

/** What the client makes of the served root (rootOf); undefined when the server is away */
export const loadRoot = async (
  api: Pick<RootDeps, "company">,
  opened: Opened,
): Promise<RootView | undefined> => {
  const company = await companyOf(api, opened);
  return company && rootOf(opened.state, company, seconds());
};

/** The key block under AK, naming the root the account state pinned, written back (P-07) */
const keepKeyBlock = (api: Pick<RootDeps, "writeKeyBlock">, opened: Opened) =>
  api.writeKeyBlock(
    opened.token,
    sealKeyBlock(opened.accountKey, opened.accountId, followRoot(opened.keyBlock, opened.state)),
  );

/**
 * The person compared the new root's code with an owner and confirmed it: the change goes into the
 * account state and the key block. False when the state refuses it (another device confirmed
 * something else) or the server is away.
 */
export const confirmRootChange = async (
  api: RootDeps,
  account: OpenAccount,
  changes: readonly RootChange[],
) => {
  const saved = await account.updateState(api, (state) => acceptRootChange(state, changes));
  const opened = account.opened();
  return saved.ok && opened !== undefined && (await keepKeyBlock(api, opened));
};

export type ReplaceError = "no-root" | "unreachable" | "untrusted" | "refused";

/** The rotating owner's state: the new root pinned with its private key, the new certificates seen */
const rotatedState = (
  state: AccountState,
  change: RootChange,
  rootSecretKey: Uint8Array,
  certificates: readonly Certificate[],
  policyVersion: number,
) => {
  const accepted = acceptRootChange(state, [change], rootSecretKey);
  if (!accepted) return undefined;
  const seen = { ...accepted.certificates };
  for (const c of certificates) {
    const id = encodeBytes(c.accountId);
    seen[id] = Math.max(seen[id] ?? 0, c.issuedAt);
  }
  return { ...accepted, certificates: seen, policy: Math.max(accepted.policy, policyVersion) };
};

/** The root in force, the policy and the members, as this owner's client checks them */
const checked = async (api: RootDeps, opened: Opened) => {
  const [company, members] = await Promise.all([companyOf(api, opened), api.members(opened.token)]);
  if (!company || !members) return { ok: false as const, error: "unreachable" as const };
  const view = rootOf(opened.state, company, seconds());
  if (view.kind !== "current") return { ok: false as const, error: "untrusted" as const };
  const { state } = opened;
  const policy = checkPolicy(view.root, company.companyId, state.policy, company.policy);
  if (!policy.ok) return { ok: false as const, error: "untrusted" as const };
  const views = checkMembers(view.root, members, state.certificates, state.retiredRoots);
  return { ok: true as const, companyId: company.companyId, policy: policy.value, views };
};

/**
 * An owner replaces the company root (root-rotation.ts), then pins the new one on this account's
 * devices; the owner's own grant keeps the new root if writing the state fails. The new root's
 * code comes back, for the members to compare.
 */
export const replaceRoot = async (
  api: RootDeps,
  account: OpenAccount,
): Promise<{ ok: true; value: string } | { ok: false; error: ReplaceError }> => {
  const opened = account.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root) return { ok: false, error: "no-root" };
  const now = await checked(api, opened);
  if (!now.ok) return now;
  const rotation = rotateRoot({
    rootSecretKey: root,
    companyId: now.companyId,
    views: now.views,
    policy: now.policy,
    now: seconds(),
    seen: opened.state.certificates,
  });
  if (!(await api.replaceRoot(opened.token, rotation))) return { ok: false, error: "refused" };
  const { change, rootSecretKey, certificates, policy } = rotation;
  const saved = await account.updateState(api, (state) =>
    rotatedState(state, change, rootSecretKey, certificates, policy.version),
  );
  const after = account.opened();
  if (!saved.ok || !after || !(await keepKeyBlock(api, after)))
    return { ok: false, error: "unreachable" };
  return { ok: true, value: comparisonCode(rootFingerprint(change.newRootPublicKey)) };
};
