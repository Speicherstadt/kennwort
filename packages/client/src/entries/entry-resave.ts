/**
 * Re-saving entries when a manager reduces an editor to reading (P-09, resave.ts in the core):
 * before the role entry every entry whose newest version that editor wrote goes out again under
 * the manager's signature; after it, and whenever a manager's client catches up, the newest
 * version that still counts is written anew above what the device refused.
 */
import {
  type Device,
  type Pulled,
  refusedByReaders,
  resaveBy,
  restoreRefused,
  type SyncContext,
  type SyncServer,
  writtenByReaders,
} from "@kennwort/core";
import type { SaveError, SyncDevice, VaultState } from "./entry-store.ts";

type Deps = {
  current: (vaultIdText: string) => VaultState | undefined;
  pullNow: (state: VaultState) => Promise<Pulled | undefined>;
  syncDevice: SyncDevice;
  serverNow: (state: VaultState) => { ctx: SyncContext; server: SyncServer } | undefined;
};

export type ResaveDone = { ok: true } | { ok: false; error: SaveError };

/** Syncs what change queues; not saved while anything stays queued */
const syncAll = async (
  syncDevice: SyncDevice,
  state: VaultState,
  change: (device: Device) => Device,
): Promise<ResaveDone> => {
  const done = await syncDevice(state, change);
  if (typeof done === "string") return { ok: false, error: done };
  return done.synced.device.queue.length > 0 ? { ok: false, error: "not-saved" } : { ok: true };
};

export const entryResave = ({ current, pullNow, syncDevice, serverNow }: Deps) => ({
  /** Before the role entry: the account's entries written again under this device's signature */
  resave: async (vaultIdText: string, accountId: Uint8Array): Promise<ResaveDone> => {
    const state = current(vaultIdText);
    const open = state && serverNow(state);
    if (!state || !open) return { ok: false, error: "locked" };
    const records = await Promise.resolve(open.server.pull()).catch(() => undefined);
    if (!records || !(await pullNow(state))) return { ok: false, error: "unreachable" };
    const pulled = current(vaultIdText) as VaultState;
    return syncAll(syncDevice, pulled, (device) => resaveBy(device, records, accountId));
  },

  /** After it: what was refused as written by a reader, written anew from the versions that count */
  restore: async (vaultIdText: string): Promise<ResaveDone> => {
    const state = current(vaultIdText);
    const open = state && serverNow(state);
    if (!state || !open) return { ok: false, error: "locked" };
    const records = await Promise.resolve(open.server.pull()).catch(() => undefined);
    if (!records || !(await pullNow(state))) return { ok: false, error: "unreachable" };
    const pulled = current(vaultIdText) as VaultState;
    const histories = await Promise.all(
      writtenByReaders(records, open.ctx).map(
        async (entryId) => (await open.server.versions?.(entryId)) ?? [],
      ),
    ).catch(() => undefined);
    if (!histories) return { ok: false, error: "unreachable" };
    return syncAll(syncDevice, pulled, (device) => restoreRefused(device, histories, open.ctx));
  },

  /** Whether the device refused an entry as written by someone who may not edit */
  restorable: (vaultIdText: string) =>
    refusedByReaders(current(vaultIdText)?.refused ?? []).length > 0,
});
