/**
 * The vaults of this account (K-305, P-05, P-06), without any interface: load each vault's log,
 * check it with verifyLog under the pinned root and the certificates it confirms, open the vault
 * key only as the log binds it, read the name sealed with it, and remember how far each log
 * reached in the account state, so a shorter or rewritten log later is an attack (E-07). The keys
 * of earlier epochs open only to read what a rotation has not re-encrypted yet (P-11).
 */
import {
  type AccountState,
  type Certificate,
  checkMembers,
  createVault,
  encodeBytes,
  idKey,
  isMember,
  type Keyring,
  type LogEntry,
  type LogState,
  type MemberView,
  openRings,
  openVaultName,
  remember,
  sealVaultName,
  type Trust,
  trustedRoot,
  type VaultRole,
  verifyLog,
} from "@kennwort/core";
import { kdf } from "@kennwort/crypto";
import type { MembersApi } from "../session/members-api.ts";
import type { OpenAccount, Opened } from "../session/open-account.ts";
import type { StateDeps } from "../session/state-sync.ts";
import type { Appended, ListedVault, VaultApi } from "../session/vaults-api.ts";

export type VaultDeps = VaultApi & Pick<MembersApi, "company" | "members"> & StateDeps;

export type Vault = {
  idText: string;
  /** undefined until a manager named it under the current key */
  name: string | undefined;
  role: VaultRole;
  /** The key of the log's current epoch: every version is written under it */
  ring: Keyring;
  /** Keys of earlier epochs, to read versions a rotation has not re-encrypted yet (P-11) */
  older: Keyring[];
  log: LogState;
  /** The checked log itself: who left and when, for the change marks and the exit report */
  entries: LogEntry[];
};
/** A vault this client does not trust: shown as such, never opened */
export type Refused = { idText: string; error: string };
/** People of the company as the pinned root confirms them, for names and to add to a vault */
export type Loaded = {
  vaults: Vault[];
  refused: Refused[];
  people: MemberView[];
  /** The pinned root and the certificates it confirmed: what entries are checked against (P-09) */
  trust: Trust;
  /**
   * Accounts that left the company, hex as the log keys them, by the server's word: a manager's
   * client removes them from its vaults and rotates the keys (dueExits, P-11)
   */
  left: ReadonlySet<string>;
};

const seconds = () => Math.floor(Date.now() / 1000);

type Checked = { trust: Trust; people: MemberView[] };

/** The pinned root and every certificate it confirms; nothing at all if the root does not match */
export const trustOf = async (api: VaultDeps, opened: Opened): Promise<Checked | undefined> => {
  const [company, members] = await Promise.all([
    api.company(opened.token),
    api.members(opened.token),
  ]);
  if (!company || !members) return undefined;
  const root = trustedRoot(opened.state.rootFingerprint, company.rootPublicKey);
  if (!root) return undefined;
  const people = checkMembers(root, members, opened.state.certificates);
  const certificates = new Map<string, Certificate>();
  for (const view of people)
    if (view.status === "certified" && view.certificate)
      certificates.set(idKey(view.accountId), view.certificate);
  return { trust: { rootPublicKey: root, certificates, now: seconds() }, people };
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
  // A server that still lists the vault after this account's access ran out gets no opening
  if (!isMember(log, opened.accountId, seconds())) return { idText, error: "expired" };
  const rings = openRings(opened.keyBlock, opened.accountId, log, listed.id, keys);
  if (!rings.ok) return { idText, error: rings.error };
  const ring = rings.value.current;
  // The name under the key of its own epoch: a rotation seals it anew, and until then the older
  // key, which every member left holds, still reads it
  const nameRing = [ring, ...rings.value.older].find((r) => r.epoch === listed.nameEpoch);
  const name = listed.name && nameRing ? openVaultName(nameRing, listed.name) : null;
  return {
    idText,
    name: name?.ok ? name.value : undefined,
    role: member.role,
    ring,
    older: rings.value.older,
    log,
    entries,
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
  session: OpenAccount,
): Promise<{ ok: true; value: Loaded } | { ok: false; error: "unreachable" | "untrusted" }> => {
  const opened = session.opened();
  if (!opened) return { ok: false, error: "unreachable" };
  const [listed, checked] = await Promise.all([api.vaults(opened.token), trustOf(api, opened)]);
  if (!listed) return { ok: false, error: "unreachable" };
  if (!checked) return { ok: false, error: "untrusted" };
  const { trust, people } = checked;
  const results = await Promise.all(listed.map((one) => openOne(api, opened, trust, one)));
  const vaults = results.filter((r): r is Vault => "ring" in r);
  const refused = results.filter((r): r is Refused => !("ring" in r));
  if (vaults.some((v) => (opened.state.logs[v.idText]?.seq ?? -1) < v.log.seq))
    await session.updateState(api, rememberLogs(vaults));
  const left = new Set(people.filter((p) => p.leftAt != null).map((p) => idKey(p.accountId)));
  return { ok: true, value: { vaults, refused, people, trust, left } };
};

export type CreateError = "uncertified" | "unreachable" | "refused" | "exists";

/**
 * The personal vault's ID, derived from the account key: every device of the account picks the same
 * one, so two devices opening an empty account at once make one personal vault, not two
 */
export const personalVaultId = (opened: Opened) =>
  kdf(opened.accountKey, new Uint8Array(), "kennwort/personal-vault/v1", opened.accountId).slice(
    0,
    16,
  );

const appendedError = (appended: Exclude<Appended, "ok">): CreateError =>
  appended === "unreachable" ? "unreachable" : appended === "stale" ? "exists" : "refused";

/**
 * A new vault with this account as its manager, named under its key (P-05). The personal vault
 * may be taken already by another device of the account: then its genesis decides, and only the
 * first one counts ("exists" for the other).
 */
export const newVault = async (
  api: VaultDeps,
  session: OpenAccount,
  name: string,
  personal = false,
): Promise<{ ok: true; value: string } | { ok: false; error: CreateError }> => {
  const opened = session.opened();
  if (!opened) return { ok: false, error: "unreachable" };
  const checked = await trustOf(api, opened);
  const me = checked?.trust.certificates.get(idKey(opened.accountId));
  if (!me) return { ok: false, error: "uncertified" };
  const signer = { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey };
  const pick = personal ? () => personalVaultId(opened) : undefined;
  const made = createVault(signer, me, seconds(), pick);
  const { token } = opened;
  const created = await api.newVault(token, made.ring.vaultId);
  if (created === "failed" || (created === "taken" && !personal))
    return { ok: false, error: created === "taken" ? "refused" : "unreachable" };
  const appended = await api.appendLog(token, made.genesis, made.wrappedKey);
  if (appended !== "ok") return { ok: false, error: appendedError(appended) };
  const sealed = sealVaultName(made.ring, name);
  if (!(await api.renameVault(token, made.ring.vaultId, 0, sealed)))
    return { ok: false, error: "unreachable" };
  return { ok: true, value: encodeBytes(made.ring.vaultId) };
};
