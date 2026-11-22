/**
 * What an export holds (K-504): the vaults by name with their entries' content as P-09 keeps it –
 * every field, the history, tags, favorites, one-time codes and passkeys – but without the change
 * marks, which name people of this company and mean nothing anywhere else.
 */
import { z } from "zod";
import { EntryContent } from "../sync/content.ts";

export const ExportedEntry = EntryContent.omit({ toChange: true });
export type ExportedEntry = z.infer<typeof ExportedEntry>;

export const ExportVault = z.object({ name: z.string(), entries: z.array(ExportedEntry) });
export type ExportVault = z.infer<typeof ExportVault>;

/** The plaintext inside Kennwort's encrypted export (F-13) */
export const ExportPayload = z.object({
  version: z.literal(1),
  /** Milliseconds since 1970 */
  exportedAt: z.number().int().nonnegative(),
  vaults: z.array(ExportVault),
});
export type ExportPayload = z.infer<typeof ExportPayload>;

/** The vaults as an export holds them: each entry's content without its change marks */
export const exportVaults = (
  vaults: readonly { name: string; entries: readonly EntryContent[] }[],
): ExportVault[] =>
  vaults.map((vault) => ({
    name: vault.name,
    entries: vault.entries.map((content) => ExportedEntry.parse(content)),
  }));
