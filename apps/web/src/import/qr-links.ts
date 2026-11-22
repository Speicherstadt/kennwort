/**
 * The QR codes of a Google Authenticator export as the import collects them (K-503): each scanned
 * link once, and how many of how many codes are read, as Google splits a large export across
 * several codes of one batch.
 */
import { migrationBatch } from "@kennwort/core";

/** The links with this one added, if it is a migration link not read yet; otherwise undefined */
export const withLink = (links: readonly string[], text: string): string[] | undefined => {
  const link = text.trim();
  if (migrationBatch(link) === undefined) return undefined;
  return links.includes(link) ? [...links] : [...links, link];
};

/** Codes read and codes in the exports they belong to; a code read twice counts once */
export const qrProgress = (links: readonly string[]) => {
  const read = new Set<string>();
  const sizes = new Map<number, number>();
  for (const link of links) {
    const batch = migrationBatch(link);
    if (!batch) continue;
    read.add(`${batch.id}/${batch.index}`);
    sizes.set(batch.id, batch.size);
  }
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  return { read: read.size, total };
};
