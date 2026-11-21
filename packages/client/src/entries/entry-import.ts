/**
 * Writing imported entries (K-501): a batch of new entries goes through the same path as any new
 * entry (encrypted, signed and bound to entry, vault and version, P-09), but in one sync. What the
 * server did not take leaves the queue at once: an import that stopped must not finish later, behind
 * the person's back, with entries they were told were not imported.
 */
import { type EntryContent, edit, encodeBytes, idKey } from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import type { SaveError, SyncEntries, VaultState } from "./entry-store.ts";

/** The IDs of the entries stored, and how many were not */
export type Imported = { saved: string[]; unsaved: number };

/** The state without queued changes to these entries */
const withoutQueued = (state: VaultState, entryIds: readonly Uint8Array[]): VaultState => {
  const dropped = new Set(entryIds.map(idKey));
  return {
    ...state,
    device: {
      ...state.device,
      queue: state.device.queue.filter((op) => !dropped.has(idKey(op.entryId))),
    },
  };
};

export const entryImport = (
  syncEntries: SyncEntries,
  update: (vaultIdText: string, change: (state: VaultState) => VaultState) => void,
) => ({
  /** New entries in one sync; on any failure none of them stays queued */
  saveNew: async (
    vaultIdText: string,
    contents: readonly EntryContent[],
  ): Promise<{ ok: true; value: Imported } | { ok: false; error: SaveError }> => {
    const entryIds = contents.map(() => randomBytes(16));
    const queue = (device: Parameters<typeof edit>[0]) =>
      contents.reduce((d, content, i) => edit(d, entryIds[i] as Uint8Array, content), device);
    const done = await syncEntries(vaultIdText, entryIds, queue);
    if (!done.ok) {
      update(vaultIdText, (s) => withoutQueued(s, entryIds));
      return done;
    }
    const { unsaved } = done.value;
    if (unsaved.length > 0) update(vaultIdText, (s) => withoutQueued(s, unsaved));
    const left = new Set(unsaved.map(idKey));
    const saved = entryIds.filter((id) => !left.has(idKey(id))).map(encodeBytes);
    return { ok: true, value: { saved, unsaved: unsaved.length } };
  },
});
