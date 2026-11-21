/**
 * Writing an import (K-501): batch by batch through the entry store's normal write path, so every
 * entry is encrypted, signed and bound like one made by hand (P-09); the progress after each
 * batch. The first batch the store refuses (rotation due, offline, read only) ends the import:
 * the rest is not written, and nothing of a refused batch stays queued (entry-import.ts).
 */
import type { Imported } from "@kennwort/client/entries/entry-import.ts";
import type { SaveError } from "@kennwort/client/entries/entry-store.ts";
import type { EntryContent } from "@kennwort/core";

export type SaveBatch = (
  batch: EntryContent[],
) => Promise<{ ok: true; value: Imported } | { ok: false; error: SaveError }>;

export type ImportOutcome = { imported: number; unsaved: number; error?: SaveError };

/** One sync per batch: small enough for steady progress, large enough not to pull for each entry */
export const BATCH_SIZE = 25;

export const runImport = async (
  save: SaveBatch,
  contents: readonly EntryContent[],
  onProgress: (written: number) => void,
  size = BATCH_SIZE,
): Promise<ImportOutcome> => {
  let imported = 0;
  let unsaved = 0;
  for (let start = 0; start < contents.length; start += size) {
    const batch = contents.slice(start, start + size);
    const saved = await save(batch);
    if (!saved.ok) return { imported, unsaved: contents.length - imported, error: saved.error };
    imported += saved.value.saved.length;
    unsaved += saved.value.unsaved;
    onProgress(start + batch.length);
  }
  return { imported, unsaved };
};
