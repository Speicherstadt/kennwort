/**
 * Writing a vault's entries anew after someone left (K-307, P-11), and what the exit report reads:
 * a rotation pulls first, so no entry on the server is missed, then writes every entry still in an
 * earlier epoch under the new key, marked for whoever left and could read it (rotateEntries, the
 * exits of the sync context).
 */
import {
  type Exposure,
  idKey,
  type Known,
  type Pending,
  type Pulled,
  rotateEntries,
  type SeenVault,
} from "@kennwort/core";
import type { SaveError, SyncDevice, VaultState } from "./entry-store.ts";

/** The entries before and after a rotation, by entry: the shares are made again from them */
export type Rotated = { before: ReadonlyMap<string, Known>; after: ReadonlyMap<string, Known> };

type Deps = {
  current: (vaultIdText: string) => VaultState | undefined;
  states: () => VaultState[];
  pullNow: (state: VaultState) => Promise<Pulled | undefined>;
  syncDevice: SyncDevice;
};

/** Whether the entry is in an epoch before the vault's current one, or has no known key */
const isBehind = (known: Known | undefined, epoch: number) =>
  known?.key === undefined || known.key.epoch < epoch;

export const entryRotation = ({ current, states, pullNow, syncDevice }: Deps) => ({
  /**
   * After the vault's key rotated: every entry still in an earlier epoch, and every queued change,
   * written again under the new key. One a rotation already wrote anew gets no new version (a
   * catch-up after a rotation that did not write everything).
   */
  rotate: async (
    vaultIdText: string,
    exposure?: Exposure,
  ): Promise<{ ok: true; value: Rotated } | { ok: false; error: SaveError }> => {
    const state = current(vaultIdText);
    if (!state) return { ok: false, error: "locked" };
    if (!(await pullNow(state))) return { ok: false, error: "unreachable" };
    const pulled = current(vaultIdText) as VaultState;
    const epoch = pulled.vault.log.epoch;
    const done = await syncDevice(pulled, (device) => {
      const waiting = new Set(device.queue.map((op) => idKey(op.entryId)));
      const due = (op: Pending) =>
        waiting.has(idKey(op.entryId)) || isBehind(device.known.get(idKey(op.entryId)), epoch);
      const rotated = rotateEntries(device, exposure);
      return { ...rotated, queue: rotated.queue.filter(due) };
    });
    if (typeof done === "string") return { ok: false, error: done };
    const { device } = done.synced;
    return device.queue.length > 0
      ? { ok: false, error: "not-saved" }
      : { ok: true, value: { before: pulled.device.known, after: device.known } };
  },

  /** Whether the device knows an entry of the vault from before its current epoch */
  behind: (vaultIdText: string) => {
    const state = current(vaultIdText);
    if (!state) return false;
    return [...state.device.known.values()].some((known) => isBehind(known, state.vault.log.epoch));
  },

  /** Every vault with its checked log and the entries as this device knows them */
  seen: (): SeenVault[] =>
    states().map((state) => ({
      vaultId: state.vault.ring.vaultId,
      log: state.vault.entries,
      entries: [...state.device.known.values()].map((known) => ({
        entryId: known.entryId,
        content: known.content,
        key: known.key && { epoch: known.key.epoch },
      })),
    })),
});
