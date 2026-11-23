/**
 * The demo's server stand-in (K-706, docs/plan.md, Demo ohne Server): what the real server keeps
 * for one company, held in this tab's memory only and gone with a reload. Like the real server it
 * holds IDs, public keys and ciphertexts; it decides nothing the client relies on, because the
 * client checks every signature and every binding itself (packages/client, P-09).
 */

/** An account as the server knows it: sign-in keys and, once uploaded, the sealed key material */
export type DemoAccount = {
  id: string;
  role: "owner" | "admin" | "member";
  name: string | null;
  accountSalt: string;
  loginPublicKey: string;
  recoveryPublicKey: string | null;
  keys: DemoKeys | undefined;
};

export type DemoKeys = {
  xwingPublicKey: string;
  edPublicKey: string;
  keyBlock: string;
  unlock: { passphrase: string; recovery: string };
  state: string;
  stateCounter: number;
  certificate: Record<string, unknown> | null;
};

/** A wire log entry as the client sent it; only the fields the stand-in reads are named */
export type WireLogEntry = Record<string, unknown> & {
  seq: number;
  epoch: number;
  action: string;
  accountId: string;
};

export type DemoVault = {
  id: string;
  log: WireLogEntry[];
  /** Wrapped vault keys: account → epoch → wrapped key */
  keys: Map<string, Map<number, string>>;
  name: string | null;
  nameEpoch: number | null;
  /** Records as the client sent them, the newest version of each entry */
  records: Map<string, Record<string, unknown> & { version: number }>;
};

export type DemoStore = {
  company: { id: string; rootPublicKey: string } | undefined;
  accounts: Map<string, DemoAccount>;
  sessions: Map<string, string>;
  challenges: Map<string, { accountId: string; way: "passphrase" | "recovery"; challenge: string }>;
  vaults: Map<string, DemoVault>;
};

export const emptyStore = (): DemoStore => ({
  company: undefined,
  accounts: new Map(),
  sessions: new Map(),
  challenges: new Map(),
  vaults: new Map(),
});

/** The accounts the log names as members now: added or created, and not removed since */
export const membersOfLog = (log: readonly WireLogEntry[]) => {
  const members = new Set<string>();
  for (const entry of log) {
    if (entry.action === "create" || entry.action === "add") members.add(entry.accountId);
    if (entry.action === "remove") members.delete(entry.accountId);
  }
  return members;
};
