/**
 * The vaults of this account (K-305, P-05, P-06), without any interface: load each vault's log,
 * check it with verifyLog under the pinned root and the certificates it confirms, open the vault
 * key only as the log binds it, read the name sealed with it, and remember how far each log
 * reached in the account state, so a shorter or rewritten log later is an attack (E-07).
 */
import {
  type AccountState,
  type Certificate,
  checkMembers,
  createVault,
  encodeBytes,
  idKey,
  type Keyring,
  type LogState,
  openVaultKey,
  openVaultName,
  remember,
  sealVaultName,
  type Trust,
  trustedRoot,
  type VaultRole,
  verifyLog,
} from "@kennwort/core";
import type { MembersApi } from "../session/members-api.ts";
import type { Opened, Session } from "../session/session.ts";
import type { StateDeps } from "../session/state-sync.ts";
import type { ListedVault, VaultApi } from "../session/vaults-api.ts";

export type VaultDeps = VaultApi & Pick<MembersApi, "company" | "members"> & StateDeps;

export type Vault = {
  idText: string;
  /** undefined until a manager named it under the current key */
  name: string | undefined;
  role: VaultRole;
  ring: Keyring;
  log: LogState;
};
/** A vault this client does not trust: shown as such, never opened */
export type Refused = { idText: string; error: string };
export type Loaded = { vaults: Vault[]; refused: Refused[] };

const seconds = () => Math.floor(Date.now() / 1000);

/** The pinned root and every certificate it confirms; nothing at all if the root does not match */
export const trustOf = async (api: VaultDeps, opened: Opened): Promise<Trust | undefined> => {
  const [company, members] = await Promise.all([
    api.company(opened.token),
    api.members(opened.token),
  ]);
  if (!company || !members) return undefined;
  const root = trustedRoot(opened.state.rootFingerprint, company.rootPublicKey);
  if (!root) return undefined;
  const certificates = new Map<string, Certificate>();
  for (const view of checkMembers(root, members, opened.state.certificates))
    if (view.status === "certified" && view.certificate)
      certificates.set(idKey(view.accountId), view.certificate);
  return { rootPublicKey: root, certificates, now: seconds() };
};

const openOne = async (
  api: VaultDeps,
  opened: Opened,
  trust: Trust,
  listed: ListedVault,
): Promise<Vault | Refused> => {
  const idText = encodeBytes(listed.id);
  const [entries, keys] = await Promise.all([
    api.vaultLog(opened.token, listed.id),
    api.vaultKeys(opened.token, listed.id),
  ]);
  if (!entries || !keys) return { idText, error: "unreachable" };
  const checked = verifyLog(listed.id, entries, trust, opened.state.logs[idText]);
  if (!checked.ok) return { idText, error: checked.error };
  const log = checked.value;
  const wrapped = keys.find((key) => key.epoch === log.epoch)?.wrapped;
  const member = log.members.get(idKey(opened.accountId));
  if (!wrapped || !member) return { idText, error: "no-key" };
  const ring = openVaultKey(opened.keyBlock, opened.accountId, log, listed.id, log.epoch, wrapped);
  if (!ring.ok) return { idText, error: ring.error };
  const name =
    listed.name && listed.nameEpoch === log.epoch ? openVaultName(ring.value, listed.name) : null;
  return {
    idText,
    name: name?.ok ? name.value : undefined,
    role: member.role,
    ring: ring.value,
    log,
  };
};

/** The logs that reached further than the account state remembers, written back in one go */
const rememberLogs = (vaults: Vault[]) => (state: AccountState) => {
  const logs = { ...state.logs };
  let changed = false;
  for (const vault of vaults) {
    const known = logs[vault.idText];
    if (known && known.seq >= vault.log.seq) continue;
    logs[vault.idText] = remember(vault.log);
    changed = true;
  }
  return changed ? { ...state, logs } : undefined;
};

export const loadVaults = async (
  api: VaultDeps,
  session: Session,
): Promise<{ ok: true; value: Loaded } | { ok: false; error: "unreachable" | "untrusted" }> => {
  const opened = session.opened();
  if (!opened) return { ok: false, error: "unreachable" };
  const [listed, trust] = await Promise.all([api.vaults(opened.token), trustOf(api, opened)]);
  if (!listed) return { ok: false, error: "unreachable" };
  if (!trust) return { ok: false, error: "untrusted" };
  const results = await Promise.all(listed.map((one) => openOne(api, opened, trust, one)));
  const vaults = results.filter((r): r is Vault => "ring" in r);
  const refused = results.filter((r): r is Refused => !("ring" in r));
  if (vaults.some((v) => (opened.state.logs[v.idText]?.seq ?? -1) < v.log.seq))
    await session.updateState(api, rememberLogs(vaults));
  return { ok: true, value: { vaults, refused } };
};

export type CreateError = "uncertified" | "unreachable" | "refused";

/** A new vault with this account as its manager, named under its key (P-05) */
export const newVault = async (
  api: VaultDeps,
  session: Session,
  name: string,
): Promise<{ ok: true; value: string } | { ok: false; error: CreateError }> => {
  const opened = session.opened();
  if (!opened) return { ok: false, error: "unreachable" };
  const trust = await trustOf(api, opened);
  const me = trust?.certificates.get(idKey(opened.accountId));
  if (!me) return { ok: false, error: "uncertified" };
  const signer = { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey };
  const made = createVault(signer, me, seconds());
  const { token } = opened;
  if (!(await api.newVault(token, made.ring.vaultId))) return { ok: false, error: "unreachable" };
  const appended = await api.appendLog(token, made.genesis, made.wrappedKey);
  if (appended !== "ok")
    return { ok: false, error: appended === "unreachable" ? "unreachable" : "refused" };
  const sealed = sealVaultName(made.ring, name);
  if (!(await api.renameVault(token, made.ring.vaultId, 0, sealed)))
    return { ok: false, error: "unreachable" };
  return { ok: true, value: encodeBytes(made.ring.vaultId) };
};
