/**
 * The exit report of P-11 (docs/sicherheitsdesign.md): what a person who leaves had access to,
 * computed on a manager's device from the checked logs and the decrypted entries, never by the
 * server. Access means a vault key the person held: every epoch they were a member in, from the
 * first `add` until their `remove`, a time limit or not (ETH study, E-26: a former member keeps
 * what they could decrypt). An entry counts if its newest version lies in such an epoch, or if it
 * still carries their change mark after a rotation re-encrypted it.
 */
import { encodeBytes } from "../sync/bytes.ts";
import { secretFieldIds } from "../sync/change-marks.ts";
import type { EntryContent } from "../sync/content.ts";
import type { Exposure as Exit } from "../sync/device.ts";
import type { LogEntry, VaultRole } from "./log-entry.ts";
import { idKey } from "./verify-log.ts";

export type Exposure = {
  /** The epochs whose vault key the person held */
  epochs: number[];
  /** The last role the log gave them */
  role: VaultRole;
  /** Signed time of their first add, Unix seconds */
  from: number;
  /** Signed time of their last removal; 0 while still a member */
  until: number;
};

type Access = Omit<Exposure, "epochs">;

/**
 * The person's access to one vault by its checked log; undefined if they were never a member. The
 * log is checked: a role change or removal of the person comes only after their add.
 */
export const exposureOf = (
  entries: readonly LogEntry[],
  accountId: Uint8Array,
): Exposure | undefined => {
  const key = idKey(accountId);
  const epochs = new Set<number>();
  let access: Access | undefined;
  let member = false;
  for (const entry of entries) {
    if (idKey(entry.accountId) === key) {
      if (entry.action === "create" || entry.action === "add") {
        member = true;
        access = { role: entry.role as VaultRole, from: access?.from ?? entry.time, until: 0 };
      } else if (entry.action === "role") (access as Access).role = entry.role as VaultRole;
      else if (entry.action === "remove") {
        member = false;
        (access as Access).until = entry.time;
      }
    }
    if (member) epochs.add(entry.epoch);
  }
  return access && { ...access, epochs: [...epochs] };
};

/**
 * Everyone who left the vault and is not back, with the time of their last removal and the epochs
 * they held: what every write marks against (SyncContext.exposures), so an entry the server hid
 * from the rotation still gets its mark when it is next written (P-11)
 */
export const pastExposures = (entries: readonly LogEntry[]): Exit[] => {
  // Everyone a checked log names was added first, so each has an exposure; members have no end
  const named = new Map(entries.map((entry) => [idKey(entry.accountId), entry.accountId]));
  return [...named.values()].flatMap((accountId) => {
    const { until, epochs } = exposureOf(entries, accountId) as Exposure;
    return until === 0 ? [] : [{ account: encodeBytes(accountId), at: until, epochs }];
  });
};

/** An entry as a device knows it: the epoch of its newest version and its content */
export type SeenEntry = {
  entryId: Uint8Array;
  content: EntryContent;
  key?: { epoch: number } | undefined;
};
export type SeenVault = {
  vaultId: Uint8Array;
  log: readonly LogEntry[];
  entries: readonly SeenEntry[];
};

export type ReportEntry = {
  entryId: Uint8Array;
  title: string;
  type: EntryContent["type"];
  /** Names of the secret fields the person could read */
  secrets: string[];
};
export type ReportVault = Omit<Exposure, "epochs"> & {
  vaultId: Uint8Array;
  entries: ReportEntry[];
};

const secretNames = (content: EntryContent) => {
  const ids = new Set(secretFieldIds(content));
  return content.fields.filter((field) => ids.has(field.id)).map((field) => field.name);
};

/** Per vault the person was in: role, from when to when, and every entry they could read */
export const exitReport = (accountId: Uint8Array, vaults: readonly SeenVault[]): ReportVault[] => {
  const account = encodeBytes(accountId);
  return vaults.flatMap((vault) => {
    const exposure = exposureOf(vault.log, accountId);
    if (!exposure) return [];
    const { epochs, ...access } = exposure;
    const readable = vault.entries.filter(
      (entry) =>
        (entry.key !== undefined && epochs.includes(entry.key.epoch)) ||
        entry.content.toChange?.some((mark) => mark.account === account),
    );
    const entries = readable.map((entry) => ({
      entryId: entry.entryId,
      title: entry.content.title,
      type: entry.content.type,
      secrets: secretNames(entry.content),
    }));
    return [{ vaultId: vault.vaultId, ...access, entries }];
  });
};
