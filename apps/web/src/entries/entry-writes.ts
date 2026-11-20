/**
 * Writing entries (K-306, P-10): a new entry or a change, and the entry written anew under a new
 * entry key after a share was revoked; each is synced at once by the store's syncChange.
 */
import {
  bytes,
  type EntryContent,
  type EntryKey,
  edit,
  encodeBytes,
  idKey,
  rekey,
} from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import type { SaveError, SyncChange, VaultState } from "./entry-store.ts";

type Saved<T> = { ok: true; value: T } | { ok: false; error: SaveError };

export const entryWrites = (
  syncChange: SyncChange,
  current: (vaultIdText: string) => VaultState | undefined,
) => ({
  /** A new entry (no ID) or a change; it stays queued if the server failed */
  save: async (
    vaultIdText: string,
    content: EntryContent,
    entryIdText?: string,
  ): Promise<Saved<string>> => {
    const given = entryIdText === undefined ? undefined : bytes(16).safeParse(entryIdText);
    if (given && !given.success) return { ok: false, error: "unreachable" };
    const entryId = given?.data ?? randomBytes(16);
    const saved = await syncChange(vaultIdText, entryId, (d) => edit(d, entryId, content));
    return saved.ok ? { ok: true, value: encodeBytes(entryId) } : saved;
  },

  /** The entry key the device holds for an entry, to share it (P-10) */
  keyOf: (vaultIdText: string, entryIdText: string): EntryKey | undefined => {
    const entryId = bytes(16).safeParse(entryIdText);
    if (!entryId.success) return undefined;
    return current(vaultIdText)?.device.known.get(idKey(entryId.data))?.key;
  },

  /**
   * The entry written anew under a new entry key, after a share was revoked (P-10); gives that key,
   * which the remaining shares are made again with
   */
  rekey: async (vaultIdText: string, entryIdText: string): Promise<Saved<EntryKey>> => {
    const entryId = bytes(16).safeParse(entryIdText);
    if (!entryId.success) return { ok: false, error: "unreachable" };
    const saved = await syncChange(vaultIdText, entryId.data, (d) => rekey(d, entryId.data));
    if (!saved.ok) return saved;
    const key = saved.value.known.get(idKey(entryId.data))?.key;
    return key ? { ok: true, value: key } : { ok: false, error: "not-saved" };
  },
});
