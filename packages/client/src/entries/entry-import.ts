/**
 * Writing imported entries (K-501): a batch of new entries goes through the same path as any new
 * entry (encrypted, signed and bound to entry, vault and version, P-09), but in one sync. A code
 * from an authenticator app can instead go into the field „Einmalcode“ of a login already there
 * (K-503 Teil 2): a new version of that login, built from the content as the device has it at that
 * moment, so a change waiting in the queue stays in, and refused when the login has another code
 * by then. What the server did not take leaves the queue at once, and a change that waited for
 * such a login before is queued again as it was: an import that stopped must not finish later,
 * behind the person's back, with entries they were told were not imported.
 */
import {
  addTotp,
  bytes,
  type Device,
  type EntryContent,
  edit,
  encodeBytes,
  idKey,
} from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import type { SaveError, SyncEntries, VaultState } from "./entry-store.ts";

/** The IDs of the entries stored, and how many were not */
export type Imported = { saved: string[]; unsaved: number };

/** A new entry, or a code for the field „Einmalcode“ of a login of the vault */
export type ImportWrite =
  | { kind: "new"; content: EntryContent }
  | { kind: "code"; entryIdText: string; totp: string };

/** The queue as it was before for these entries: their import changes out, earlier ones back */
const queuedAsBefore = (
  state: VaultState,
  before: Device["queue"],
  entryIds: readonly Uint8Array[],
): VaultState => {
  const ids = new Set(entryIds.map(idKey));
  const ours = (op: Device["queue"][number]) => ids.has(idKey(op.entryId));
  return {
    ...state,
    device: {
      ...state.device,
      queue: [...state.device.queue.filter((op) => !ours(op)), ...before.filter(ours)],
    },
  };
};

/** The content an entry has on the device now: its waiting change, or what was synced */
const contentNow = (device: Device, entryId: Uint8Array) =>
  device.queue.find((op) => idKey(op.entryId) === idKey(entryId))?.content ??
  device.known.get(idKey(entryId))?.content;

/** The device with the code in the login, or as it was when it is no login of the vault or has a code */
const withCode = (device: Device, entryId: Uint8Array, totp: string) => {
  const content = contentNow(device, entryId);
  const added = content && addTotp(content, totp);
  return added?.ok ? edit(device, entryId, added.value) : device;
};

/** The entry ID a write goes to: a new one, or the login's; nothing for an ID that is none */
const targetOf = (write: ImportWrite) => {
  if (write.kind === "new") return randomBytes(16);
  const id = bytes(16).safeParse(write.entryIdText);
  return id.success ? id.data : undefined;
};

export const entryImport = (
  syncEntries: SyncEntries,
  current: (vaultIdText: string) => VaultState | undefined,
  update: (vaultIdText: string, change: (state: VaultState) => VaultState) => void,
) => ({
  /** New entries and codes in one sync; on any failure none of them stays queued */
  saveImport: async (
    vaultIdText: string,
    writes: readonly ImportWrite[],
  ): Promise<{ ok: true; value: Imported } | { ok: false; error: SaveError }> => {
    const before = current(vaultIdText)?.device.queue ?? [];
    const targets = writes.map(targetOf);
    const entryIds = targets.filter((id) => id !== undefined);
    /** The entries the change queued; a code that went to no login is not among them */
    const written: Uint8Array[] = [];
    const queue = (device: Device) =>
      writes.reduce((d, write, i) => {
        const id = targets[i];
        if (!id) return d;
        const next =
          write.kind === "new" ? edit(d, id, write.content) : withCode(d, id, write.totp);
        if (next !== d) written.push(id);
        return next;
      }, device);
    const done = await syncEntries(vaultIdText, entryIds, queue);
    if (!done.ok) {
      update(vaultIdText, (s) => queuedAsBefore(s, before, entryIds));
      return done;
    }
    const { unsaved } = done.value;
    if (unsaved.length > 0) update(vaultIdText, (s) => queuedAsBefore(s, before, unsaved));
    const left = new Set(unsaved.map(idKey));
    const saved = written.filter((id) => !left.has(idKey(id))).map(encodeBytes);
    return { ok: true, value: { saved, unsaved: writes.length - saved.length } };
  },
});
