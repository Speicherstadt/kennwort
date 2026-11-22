/**
 * „Exportieren“ (K-504, P-19): owners and admins take a vault or every vault this device opens
 * out of Kennwort, as its own encrypted JSON (F-13), as KeePass's KDBX 4 or as Bitwarden's CSV.
 * Before a single entry is written into a file, the export is signed into the audit log and the
 * server has taken it (it takes it from owners and admins only); then the file is made here, on
 * the device, and goes straight to a download. Nothing but the audit event reaches the server.
 */
import {
  type EntryContent,
  type ExportFormat,
  type ExportScope,
  exportSubject,
  exportVaults,
  flatCarries,
  KDBX_EXPORT_ARGON2,
  type MemberView,
  writeBitwardenCsv,
  writeKdbx,
  writeKennwortExport,
} from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";

/** Owners and admins export, once the root key confirms their role (as they invite, members.ts) */
export const mayExport = (me: MemberView | undefined) =>
  me?.status === "certified" && (me.role === "owner" || me.role === "admin");

/** The passphrase of an encrypted export: long enough to stand an offline attack on the file */
export const MIN_PASSPHRASE = 12;

export type ExportFile = { bytes: Uint8Array; name: string; type: string };
export type SourceVault = { idText: string; name: string; entries: EntryContent[] };

const FILES: Record<ExportFormat, { extension: string; type: string }> = {
  "kennwort-json": { extension: "json", type: "application/json" },
  csv: { extension: "csv", type: "text/csv;charset=utf-8" },
  kdbx: { extension: "kdbx", type: "application/octet-stream" },
};

/** The vaults the scope names: all of them, or the one with its ID */
export const vaultsIn = (scope: ExportScope, vaults: readonly SourceVault[]) =>
  scope.kind === "all" ? vaults : vaults.filter((v) => v.idText === scope.vaultId);

/** `kennwort-export-2026-11-22.json`, by the device's date */
export const fileName = (format: ExportFormat, now: number) => {
  const date = new Date(now);
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  return `kennwort-export-${day}.${FILES[format].extension}`;
};

/** The file of the vaults in the format; the passphrase seals JSON and KDBX, CSV has none */
export const buildExport = async (
  format: ExportFormat,
  vaults: readonly SourceVault[],
  passphrase: string,
  now: number,
): Promise<ExportFile> => {
  const exported = exportVaults(vaults);
  const bytes =
    format === "csv"
      ? new TextEncoder().encode(writeBitwardenCsv(exported))
      : format === "kdbx"
        ? await writeKdbx(exported, passphrase, Math.floor(now / 1000), {
            argon2: KDBX_EXPORT_ARGON2,
            random: randomBytes,
          })
        : await writeKennwortExport(passphrase, { version: 1, exportedAt: now, vaults: exported });
  return { bytes, name: fileName(format, now), type: FILES[format].type };
};

/**
 * The file as a download: a Blob, a link clicked once and the address revoked at once, so no
 * address to the plaintext outlives the click; the bytes are overwritten after
 */
export const download = (file: ExportFile, doc: Document = document) => {
  const url = URL.createObjectURL(
    new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type }),
  );
  const link = doc.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  file.bytes.fill(0);
};

export type ExportRequest = {
  format: ExportFormat;
  scope: ExportScope;
  passphrase: string;
};

export type ExportDeps = {
  /** The vaults with their entries' content, as this device opened them */
  vaults: () => SourceVault[];
  /** Signs the export into the audit log; true once the server took it */
  audit: (subject: string) => Promise<boolean>;
  save: (file: ExportFile) => void;
  now: () => number;
  /** 16 random bytes, the export's ID in the log */
  newId: () => string;
};

export type ExportOutcome =
  | { ok: true; count: number; name: string }
  | { ok: false; error: "empty" | "refused" | "failed" };

/** The file, or `failed` if writing it threw: the page must not hang on a broken entry */
const tryBuild = (request: ExportRequest, vaults: readonly SourceVault[], now: number) =>
  buildExport(request.format, vaults, request.passphrase, now).catch(() => undefined);

/** The entries the file holds: CSV and KDBX carry no passkeys */
const countIn = (format: ExportFormat, vaults: readonly SourceVault[]) =>
  vaults
    .flatMap((v) => v.entries)
    .filter((entry) => format === "kennwort-json" || flatCarries(entry)).length;

/** Audit first, then the file, then the download; nothing is written if the log refused it */
export const runExport = async (
  deps: ExportDeps,
  request: ExportRequest,
): Promise<ExportOutcome> => {
  const vaults = vaultsIn(request.scope, deps.vaults());
  if (vaults.length === 0) return { ok: false, error: "empty" };
  const subject = exportSubject({ format: request.format, scope: request.scope, id: deps.newId() });
  if (!(await deps.audit(subject))) return { ok: false, error: "refused" };
  const file = await tryBuild(request, vaults, deps.now());
  if (!file) return { ok: false, error: "failed" };
  const name = file.name;
  deps.save(file);
  return { ok: true, count: countIn(request.format, vaults), name };
};
