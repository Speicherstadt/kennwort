/**
 * Bitwarden's password-protected JSON export (K-502 Teil 4): JSON around two EncStrings of type 2
 * under a key derived from the export password, as bitwarden/clients writes it in
 * libs/tools/export-vault-core/src/services/base-vault-export.service.ts (buildPasswordExport,
 * lines 21-52):
 *
 *   {"encrypted":true,"passwordProtected":true,"salt":"<16 bytes in Base64>","kdfType":0|1,
 *    "kdfIterations":…,"kdfMemory":…,"kdfParallelism":…,
 *    "encKeyValidation_DO_NOT_EDIT":"2.iv|ct|mac","data":"2.iv|ct|mac"}
 *
 * Inside `data` is the plain JSON export, read by parseBitwardenJson. The steps follow
 * libs/importer/src/importers/bitwarden/bitwarden-password-protected-importer.ts (parse and
 * checkPassword, lines 47-105): the KDF's parameters against limits first, then the key, then the
 * key check (`encKeyValidation_DO_NOT_EDIT`), then the content. The cryptography is
 * @kennwort/crypto's (bitwarden.ts), built on @noble.
 *
 * Bitwarden's other encrypted export, "account restricted", is encrypted with the account's own
 * key; without that Bitwarden account no one opens it, so it ends as `account-encrypted`.
 */
import {
  type BitwardenCipherText,
  type BitwardenKdf,
  bitwardenDecrypt,
  bitwardenExportKey,
  type Result,
} from "@kennwort/crypto";
import { z } from "zod";
import { err, ok } from "../result.ts";
import { fromBase64 } from "./base64.ts";
import { parseBitwardenJson } from "./bitwarden-json.ts";
import { readJson } from "./text.ts";
import type { ImportError, ImportResult, LockedParser, Parser } from "./types.ts";

type Range = { min: number; max: number };

/**
 * What an export's KDF may cost: the ranges Bitwarden itself imports (bitwarden/clients,
 * libs/importer/src/importers/bitwarden/password-protected-kdf-config.ts, lines 13-62, with the
 * maximums of libs/legacy-crypto/src/models/kdf-config.ts, lines 18 and 71-73). Below them no
 * Bitwarden writes a file (`unsupported`), above them it is `too-costly`: at most about a minute
 * of noble in a browser, and Argon2's 1 GiB is noble's own ceiling and KDBX_LIMITS'.
 */
export type BitwardenLimits = {
  pbkdf2Iterations: Range;
  argon2Iterations: Range;
  argon2MemoryMiB: Range;
  argon2Parallelism: Range;
};
export const BITWARDEN_LIMITS: BitwardenLimits = {
  pbkdf2Iterations: { min: 5000, max: 2_000_000 },
  argon2Iterations: { min: 2, max: 10 },
  argon2MemoryMiB: { min: 16, max: 1024 },
  argon2Parallelism: { min: 1, max: 16 },
};

/** kdfType of libs/legacy-crypto/src/enums/kdf-type.enum.ts */
const PBKDF2_SHA256 = 0;
const ARGON2ID = 1;

const Protected = z.object({
  encrypted: z.literal(true),
  passwordProtected: z.literal(true),
  salt: z.string().min(1),
  kdfType: z.number(),
  kdfIterations: z.number(),
  kdfMemory: z.unknown().optional(),
  kdfParallelism: z.unknown().optional(),
  encKeyValidation_DO_NOT_EDIT: z.string(),
  data: z.string(),
});

type KdfFields = {
  kdfType: unknown;
  kdfIterations: unknown;
  kdfMemory?: unknown;
  kdfParallelism?: unknown;
};
type Verdict = "ok" | "unsupported" | "too-costly";

const within = (value: unknown, range: Range): Verdict => {
  if (!Number.isInteger(value)) return "unsupported";
  const number = value as number;
  if (number < range.min) return "unsupported";
  return number > range.max ? "too-costly" : "ok";
};

/** A value Bitwarden never writes outweighs one that only costs too much */
const worst = (verdicts: Verdict[]): Verdict =>
  verdicts.includes("unsupported")
    ? "unsupported"
    : verdicts.includes("too-costly")
      ? "too-costly"
      : "ok";

const judged = (verdict: Verdict, kdf: BitwardenKdf): Result<BitwardenKdf, ImportError> =>
  verdict === "ok" ? ok(kdf) : err(verdict);

/** The export's KDF if it is one Bitwarden writes and within the limits; nothing is derived */
export const bitwardenKdfOf = (
  { kdfType, kdfIterations, kdfMemory, kdfParallelism }: KdfFields,
  limits: BitwardenLimits = BITWARDEN_LIMITS,
): Result<BitwardenKdf, ImportError> => {
  const iterations = kdfIterations as number;
  if (kdfType === PBKDF2_SHA256)
    return judged(within(iterations, limits.pbkdf2Iterations), { kind: "pbkdf2", iterations });
  if (kdfType !== ARGON2ID) return err("unsupported");
  const verdict = worst([
    within(iterations, limits.argon2Iterations),
    within(kdfMemory, limits.argon2MemoryMiB),
    within(kdfParallelism, limits.argon2Parallelism),
  ]);
  const memoryMiB = kdfMemory as number;
  const parallelism = kdfParallelism as number;
  return judged(verdict, { kind: "argon2id", iterations, memoryMiB, parallelism });
};

/**
 * An EncString of type 2, "2.<iv>|<ct>|<mac>" in Base64, with a 16-byte IV and a 32-byte MAC
 * (bitwarden/sdk-internal crates/bitwarden-crypto/src/enc_string/symmetric.rs). Any other type,
 * type 0 without a MAC among them, is `unsupported`: no downgrade to an unauthenticated format.
 */
const encStringOf = (text: string): Result<BitwardenCipherText, ImportError> => {
  if (!text.startsWith("2.")) return err("unsupported");
  const parts = text.slice(2).split("|").map(fromBase64);
  const [iv, data, mac] = parts;
  if (parts.length !== 3 || iv?.length !== 16 || mac?.length !== 32 || !data?.length)
    return err("damaged");
  return ok({ iv, data, mac });
};

type Sealed = {
  salt: string;
  kdf: BitwardenKdf;
  check: BitwardenCipherText;
  data: BitwardenCipherText;
};

/** A password-protected file's parts, each checked; a file that misses one is `damaged` */
const sealedOf = (
  input: string | Uint8Array,
  limits: BitwardenLimits,
): Result<Sealed, ImportError> => {
  const doc = readJson(input, Protected);
  if (!doc.ok) return err("damaged");
  const kdf = bitwardenKdfOf(doc.value, limits);
  if (!kdf.ok) return kdf;
  const check = encStringOf(doc.value.encKeyValidation_DO_NOT_EDIT);
  if (!check.ok) return check;
  const data = encStringOf(doc.value.data);
  if (!data.ok) return data;
  return ok({ salt: doc.value.salt, kdf: kdf.value, check: check.value, data: data.value });
};

/**
 * The key from the password, the key check, then the content. A wrong password and a changed key
 * check both fail the key check's MAC (`wrong-password`); content that fails once the key checked
 * out was changed (`damaged`). Authentic content that is no plain Bitwarden export would take a
 * broken writer: `wrong-format`.
 */
const openSealed = async (sealed: Sealed, password: string): Promise<ImportResult> => {
  const key = await bitwardenExportKey(password, sealed.salt, sealed.kdf);
  if (!key.ok) return err("unsupported");
  const checked = bitwardenDecrypt(key.value, sealed.check);
  const plain = checked.ok ? bitwardenDecrypt(key.value, sealed.data) : checked;
  key.value.encKey.fill(0);
  key.value.macKey.fill(0);
  if (!checked.ok) return err("wrong-password");
  if (!plain.ok) return err("damaged");
  const entries = parseBitwardenJson(plain.value);
  plain.value.fill(0);
  return entries.ok ? entries : err("wrong-format");
};

/** With given limits; the import uses `unlockBitwardenJson` */
export const openBitwardenJson = async (
  input: Uint8Array,
  password: string,
  limits: BitwardenLimits = BITWARDEN_LIMITS,
): Promise<ImportResult> => {
  const plain = parseBitwardenJson(input);
  if (plain.ok || plain.error !== "encrypted") return plain;
  const sealed = sealedOf(input, limits);
  return sealed.ok ? openSealed(sealed.value, password) : sealed;
};

export const unlockBitwardenJson: LockedParser = (input, key) =>
  openBitwardenJson(input, key.password);

/**
 * Without the password: a plain export's entries, an account-restricted one refused, and a
 * password-protected one checked as far as it goes without the key, then `encrypted`, so the
 * import flow asks for the password and calls unlockBitwardenJson.
 */
export const checkBitwardenJson: Parser = (input) => {
  const plain = parseBitwardenJson(input);
  if (plain.ok || plain.error !== "encrypted") return plain;
  const sealed = sealedOf(input, BITWARDEN_LIMITS);
  return sealed.ok ? err("encrypted") : sealed;
};
