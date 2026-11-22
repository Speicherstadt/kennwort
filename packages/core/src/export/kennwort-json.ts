/**
 * Kennwort's own encrypted export as a file (K-504): JSON around an F-13 ciphertext (P-19), so
 * the file says what it is and which version, and nothing else in plain text:
 *
 *   {"kennwort":"export","version":1,"data":"<F-13 in base64url>"}
 *
 * Inside is the export's payload (payload.ts) as JSON. Reading it back is an import format like
 * the others (IMPORT_FORMATS): without the passphrase the file is only checked (`encrypted`), with
 * it every entry comes back as it was, its vault's name as its folder. The file comes from
 * outside: every step answers with an error value, and version and length are checked before the
 * costly key derivation.
 */
import {
  type ArgonParams,
  EXPORT_ARGON2_V1,
  type ExportOpenError,
  openExportWith,
  type Result,
  sealExport,
} from "@kennwort/crypto";
import { z } from "zod";
import { readJson } from "../import/text.ts";
import type { FileParser, ImportError, ImportResult, LockedParser } from "../import/types.ts";
import { err, ok } from "../result.ts";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { ExportPayload } from "./payload.ts";

const VERSION = 1;
/** Any version, so a newer file reads as `unsupported`, not as another format */
const Envelope = z.object({
  kennwort: z.literal("export"),
  version: z.number(),
  data: z.unknown(),
});

/** The payload as the file's bytes, sealed under the passphrase */
export const writeKennwortExport = async (
  passphrase: string,
  payload: ExportPayload,
): Promise<Uint8Array> => {
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const data = await sealExport(passphrase, plain);
  plain.fill(0);
  return new TextEncoder().encode(
    `${JSON.stringify({ kennwort: "export", version: VERSION, data: encodeBytes(data) })}\n`,
  );
};

/** The F-13 bytes of a file of version 1, or why it is none */
const sealedOf = (input: Uint8Array): Result<Uint8Array, ImportError> => {
  const envelope = readJson(input, Envelope);
  if (!envelope.ok) return envelope;
  if (envelope.value.version !== VERSION) return err("unsupported");
  const data = bytes().safeParse(envelope.value.data);
  return data.success ? ok(data.data) : err("wrong-format");
};

const OPEN_ERRORS: Record<ExportOpenError, ImportError> = {
  "wrong-passphrase": "wrong-key",
  "too-short": "wrong-format",
  "unknown-version": "unsupported",
};

/** The entries of an opened payload, each with its vault's name as its folder */
const entriesOf = (plain: Uint8Array): ImportResult => {
  // Authentic but unreadable would take a broken writer: no other format, only a wrong one
  const payload = readJson(plain, ExportPayload);
  if (!payload.ok) return err("wrong-format");
  return ok(
    payload.value.vaults.flatMap((vault) =>
      vault.entries.map((content) => ({ content, folders: vault.name === "" ? [] : [vault.name] })),
    ),
  );
};

/** With given Argon2id parameters; only for tests, the import uses `unlockKennwortExport` */
export const unlockKennwortExportWith = async (
  params: ArgonParams,
  input: Uint8Array,
  passphrase: string,
): Promise<ImportResult> => {
  const sealed = sealedOf(input);
  if (!sealed.ok) return sealed;
  const opened = await openExportWith(params, passphrase, sealed.value);
  if (!opened.ok) return err(OPEN_ERRORS[opened.error]);
  const entries = entriesOf(opened.value);
  opened.value.fill(0);
  return entries;
};

export const unlockKennwortExport: LockedParser = (input, key) =>
  unlockKennwortExportWith(EXPORT_ARGON2_V1, input, key.password);

/** Without the passphrase a file only says whether it is an export Kennwort can open */
export const checkKennwortExport: FileParser = (input) => {
  const sealed = sealedOf(input);
  return sealed.ok ? err("encrypted") : sealed;
};
