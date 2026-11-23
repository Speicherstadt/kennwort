/**
 * Deleting the account in the web app (K-607, P-28), only from the home account (K-605): the
 * passphrase is checked first; then every company linked to it is checked and deleted, signed in
 * with the way in the home keeps; then the home signs its own removal from each vault where
 * another manager remains, and deletes itself last, so a failure on the way never strands a
 * further company whose way in only the home knew. Afterwards the device forgets the account.
 */
import {
  checkPassphrase,
  confirmDeletion,
  type DeletingAccount,
  type DeletionApi,
  type DeletionError,
} from "@kennwort/client/account/deletion.ts";
import type { PrivacyApi, ServerDeletionPlan } from "@kennwort/client/session/privacy-api.ts";
import type { Appended } from "@kennwort/client/session/vaults-api.ts";
import type { Loaded } from "@kennwort/client/vaults/vaults.ts";
import {
  activeLinks,
  bytes,
  type Derive,
  deletionPlan,
  idKey,
  type LogEntry,
  removeMember,
  type SignInResult,
} from "@kennwort/core";

export type DeletionDeps = {
  api: DeletionApi &
    Pick<PrivacyApi, "deletionPlan"> & {
      signIn: (
        accountId: Uint8Array,
        passphrase: string,
        secretKey: Uint8Array,
        derive?: Derive,
      ) => Promise<SignInResult>;
      appendLog: (token: string, entry: LogEntry) => Promise<Appended>;
    };
  derive?: Derive | undefined;
};

/** The home account as the device holds it, with the vaults it loaded */
export type Home = DeletingAccount & {
  edSecretKey: Uint8Array;
  linked: Parameters<typeof activeLinks>[0];
  loaded: Loaded | undefined;
};

export type DeleteError = DeletionError | "linked-unreachable" | "removal-refused";
/** What stopped a deletion, and in which further company, if it was one */
export type DeleteOutcome =
  | { ok: true }
  | { ok: false; error: DeleteError; company?: string | undefined; vaults?: string[] };

type Linked = DeletingAccount & { name: string; passphrase: string };

/** Signs in to each further company; undefined when one does not let the device in */
const signInLinked = async (deps: DeletionDeps, home: Home) => {
  const signedIn: Linked[] = [];
  for (const link of activeLinks(home.linked)) {
    const id = bytes(16).safeParse(link.accountId);
    if (!id.success) return { ok: false as const, company: link.name };
    const token = await deps.api.signIn(id.data, link.passphrase, link.secretKey, deps.derive);
    if (!token.ok) return { ok: false as const, company: link.name };
    const { name, passphrase, secretKey } = link;
    signedIn.push({ accountId: id.data, token: token.token, secretKey, name, passphrase });
  }
  return { ok: true as const, value: signedIn };
};

/** Why the server would refuse to delete this account now, if it would */
const refusalOf = (plan: ServerDeletionPlan | undefined) =>
  !plan
    ? { error: "unreachable" as const, vaults: [] }
    : plan.refused
      ? { error: plan.refused, vaults: plan.vaults["sole-manager"] }
      : undefined;

/**
 * The home's own `remove` in each vault where another manager remains (P-28): the deletion is then
 * signed by the person, not only told by the server, and that manager rotates the key (P-11)
 */
export const signOwnRemovals = async (deps: DeletionDeps, home: Home) => {
  const loaded = home.loaded;
  if (!loaded) return true;
  const me = idKey(home.accountId);
  const time = Math.floor(Date.now() / 1000);
  const vaults = loaded.vaults.map((v) => ({ id: v.idText, members: v.log.members, vault: v }));
  const { leave } = deletionPlan(vaults, me, time);
  const signer = { accountId: home.accountId, edSecretKey: home.edSecretKey };
  for (const { vault } of vaults.filter((v) => leave.includes(v.id))) {
    // Signed times never go back (P-06)
    const at = Math.max(time, vault.log.time);
    const entry = removeMember(signer, vault.log, vault.ring.vaultId, home.accountId, at);
    if ((await deps.api.appendLog(home.token, entry)) !== "ok") return false;
  }
  return true;
};

export const deleteAccount = async (
  deps: DeletionDeps,
  home: Home,
  passphrase: string,
): Promise<DeleteOutcome> => {
  const checked = await checkPassphrase(deps.api, home, passphrase, deps.derive);
  if (!checked.ok) return checked;
  const homeRefused = refusalOf(await deps.api.deletionPlan(home.token));
  if (homeRefused) return { ok: false, ...homeRefused };
  const linked = await signInLinked(deps, home);
  if (!linked.ok) return { ok: false, error: "linked-unreachable", company: linked.company };
  // Every further company is checked before any is deleted
  for (const company of linked.value) {
    const refused = refusalOf(await deps.api.deletionPlan(company.token));
    if (refused) return { ok: false, ...refused, company: company.name };
  }
  for (const company of linked.value) {
    const done = await confirmDeletion(deps.api, company, company.passphrase, deps.derive);
    if (!done.ok) return { ok: false, error: done.error, company: company.name };
  }
  if (!(await signOwnRemovals(deps, home))) return { ok: false, error: "removal-refused" };
  const done = await confirmDeletion(deps.api, home, passphrase, deps.derive);
  return done.ok ? { ok: true } : { ok: false, error: done.error };
};
