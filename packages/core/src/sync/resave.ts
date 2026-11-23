/**
 * Re-saving entries when an editor is reduced to reading (P-09): a record counts only while its
 * author may edit now, so before the role entry the manager's client writes every entry whose
 * newest version that editor wrote again, unchanged, under its own signature, the way a rotation
 * writes every entry anew (P-11). A version the editor wrote between the re-save and the role entry
 * is refused afterwards; the manager's client then writes the newest version that still counts
 * again, above it, from the versions the server keeps, also when it catches up later.
 */
import { idKey } from "../membership/verify-log.ts";
import { type Device, edit, type Refused, ringOf, type SyncContext } from "./device.ts";
import { type EntryRecord, openRecordWithKey } from "./record.ts";

/** Queues the entries whose newest version the account wrote, unchanged, for a re-save */
export const resaveBy = (
  device: Device,
  records: readonly EntryRecord[],
  accountId: Uint8Array,
): Device =>
  records
    .filter((record) => idKey(record.author) === idKey(accountId))
    .reduce(
      (queued, record) => {
        const known = queued.device.known.get(idKey(record.entryId));
        // Only what the device took as it is: one it refused or has not pulled is not its to sign
        return known?.version === record.version
          ? { device: edit(queued.device, record.entryId, known.content) }
          : queued;
      },
      { device },
    ).device;

/** The entries the device refused because their author may not edit (any more) */
export const refusedByReaders = (refused: readonly Refused[]) => [
  ...new Map(
    refused.filter((r) => r.error === "not-editor").map((r) => [idKey(r.entryId), r.entryId]),
  ).values(),
];

/**
 * The entries whose newest record the server holds is refused now because its author may not edit:
 * also one this device took while the author still could
 */
export const writtenByReaders = (records: readonly EntryRecord[], ctx: SyncContext) =>
  records
    .filter((record) => {
      const opened = openRecordWithKey(record, ringOf(ctx, record.epoch), ctx.log, ctx.trust, 0);
      return !opened.ok && opened.error === "not-editor";
    })
    .map((record) => record.entryId);

/** The newest of an entry's versions that passes every check of P-09 now */
const newestValid = (versions: readonly EntryRecord[], ctx: SyncContext) =>
  versions
    .toSorted((a, b) => b.version - a.version)
    .map((record) => ({
      record,
      opened: openRecordWithKey(record, ringOf(ctx, record.epoch), ctx.log, ctx.trust, 0),
    }))
    .find(({ opened }) => opened.ok);

/**
 * Takes the newest version of each entry that still counts and queues it unchanged for a re-save
 * above what was refused. An entry without such a version stays as it is.
 */
export const restoreRefused = (
  device: Device,
  histories: readonly (readonly EntryRecord[])[],
  ctx: SyncContext,
): Device =>
  histories.reduce((current, versions) => {
    const found = newestValid(versions, ctx);
    if (!found?.opened.ok) return current;
    const { record, opened } = found;
    const mine = current.known.get(idKey(record.entryId));
    // Even if the device took a newer version while its author could still edit: that one does
    // not count now, and this device must not sign it anew
    const kept =
      mine?.version === record.version
        ? mine
        : {
            entryId: record.entryId,
            version: record.version,
            content: opened.value.content,
            key: { entryKey: opened.value.entryKey, epoch: record.epoch },
          };
    const known = new Map(current.known).set(idKey(record.entryId), kept);
    return edit({ known, queue: current.queue }, record.entryId, kept.content);
  }, device);
