/**
 * Google Authenticator's export (Transfer accounts → Export accounts): one or more QR codes, each
 * an `otpauth-migration://offline?data=…` link whose `data` is a Base64 `MigrationPayload`
 * (Protocol Buffers). It holds `otp_parameters` (1) with `secret` (1, raw bytes), `name` (2),
 * `issuer` (3), `algorithm` (4: 1 SHA-1, 2 SHA-256, 3 SHA-512, 4 MD5), `digits` (5: 1 six,
 * 2 eight), `type` (6: 1 HOTP, 2 TOTP) and `counter` (7), then `version` (2), `batch_size` (3),
 * `batch_index` (4) and `batch_id` (5). A large export is split across `batch_size` codes with
 * the same `batch_id`; all of them are needed. Zero means "unspecified" and reads as the default.
 * Source: google_auth.proto and GoogleAuthInfo.parseExportUri in beemdevelopment/Aegis.
 */
import type { Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import { otpEntry, withSkipped } from "./authenticator.ts";
import { type ProtoField, readMessage } from "./protobuf.ts";
import { decodeText } from "./text.ts";
import type { ImportedEntry, Parser } from "./types.ts";

type Payload = { entries: (ImportedEntry | undefined)[]; size: number; index: number; id: number };

/** The `algorithm` and `digits` enums by number; anything else is a kind Kennwort leaves out */
const ALGORITHMS = ["SHA1", "SHA1", "SHA256", "SHA512"]; // i18n-ignore: algorithm names in the vendor's format
const DIGITS = [6, 6, 8];
const TOTP_TYPES = new Set([0, 2]);
const TOTP_PERIOD = 30;

const utf8 = new TextDecoder();

/** The last value of a field, as Protocol Buffers reads a field that comes more than once */
const varint = (fields: ProtoField[], field: number) =>
  fields.findLast(
    (f): f is ProtoField & { wire: "varint" } => f.field === field && f.wire === "varint",
  )?.value ?? 0;
const bytes = (fields: ProtoField[], field: number) =>
  fields.findLast(
    (f): f is ProtoField & { wire: "bytes" } => f.field === field && f.wire === "bytes",
  )?.value ?? new Uint8Array();

/**
 * One account. Google writes the label of the setup link into the name, so it can start with
 * "Issuer:"; that part goes when it is the issuer, or is the issuer when none is given.
 */
const entryOf = (fields: ProtoField[]): ImportedEntry | undefined => {
  const name = utf8.decode(bytes(fields, 2));
  const given = utf8.decode(bytes(fields, 3));
  const colon = name.indexOf(":");
  const prefix = name.slice(0, colon);
  const split = colon >= 0 && (given === "" || prefix.trim() === given.trim());
  if (!TOTP_TYPES.has(varint(fields, 6))) return undefined;
  return otpEntry({
    issuer: split ? prefix : given,
    account: split ? name.slice(colon + 1) : name,
    secret: bytes(fields, 1),
    algorithm: ALGORITHMS[varint(fields, 4)],
    digits: DIGITS[varint(fields, 5)] ?? 0,
    period: TOTP_PERIOD,
  });
};

const readPayload = (data: Uint8Array): Result<Payload, "bad-proto"> => {
  const fields = readMessage(data);
  if (!fields.ok) return fields;
  const entries: (ImportedEntry | undefined)[] = [];
  for (const field of fields.value) {
    if (field.field !== 1 || field.wire !== "bytes") continue;
    const otp = readMessage(field.value);
    if (!otp.ok) return otp;
    entries.push(entryOf(otp.value));
  }
  const size = Math.max(1, varint(fields.value, 3));
  return ok({ entries, size, index: varint(fields.value, 4), id: varint(fields.value, 5) });
};

/** Base64 as the link carries it; a `+` the URL parser read as a space goes back */
const base64Bytes = (text: string): Uint8Array | undefined => {
  let binary: string;
  try {
    binary = atob(text.replaceAll(" ", "+").replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return undefined;
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** The payload of one migration link, if it is one */
const readLink = (link: string): Payload | undefined => {
  const url = URL.canParse(link) ? new URL(link) : undefined;
  const data = url?.searchParams.get("data");
  if (url?.protocol !== "otpauth-migration:" || url.host !== "offline" || !data) return undefined;
  const payload = base64Bytes(data);
  const read = payload && readPayload(payload);
  return read?.ok ? read.value : undefined;
};

/** Where a migration link belongs, for the import to say how many codes are still to come */
export const migrationBatch = (link: string) => {
  const payload = readLink(link);
  return payload && { id: payload.id, index: payload.index, size: payload.size };
};

/** The accounts of one export in the order of its codes, if every code of it is there */
const wholeBatch = (batch: Payload[]) => {
  const size = (batch[0] as Payload).size;
  const byIndex = new Map<number, Payload>();
  for (const payload of batch) {
    if (payload.size !== size || payload.index >= size) return undefined;
    // The same code scanned twice counts once
    byIndex.set(payload.index, payload);
  }
  if (byIndex.size !== size) return undefined;
  return [...byIndex.entries()].sort(([a], [b]) => a - b).flatMap(([, payload]) => payload.entries);
};

/** The payloads grouped by export, in the order each export first appears */
const byBatch = (payloads: Payload[]) => {
  const batches = new Map<number, Payload[]>();
  for (const payload of payloads) {
    const batch = batches.get(payload.id) ?? [];
    batch.push(payload);
    batches.set(payload.id, batch);
  }
  return [...batches.values()];
};

/** The migration links, one or more, separated by any white space (one per line as pasted) */
export const parseGoogleMigration: Parser = (input) => {
  const text = decodeText(input);
  if (!text.ok) return text;
  const links = text.value.split(/\s/).filter((link) => link !== "");
  const payloads = links.map(readLink);
  if (links.length === 0 || payloads.includes(undefined)) return err("wrong-format");
  const batches = byBatch(payloads as Payload[]).map(wholeBatch);
  if (batches.includes(undefined)) return err("incomplete");
  return withSkipped((batches as (ImportedEntry | undefined)[][]).flat());
};
