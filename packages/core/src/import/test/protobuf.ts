/**
 * Writing Protocol Buffers for the tests of the migration import (K-503): varints and
 * length-delimited fields, and Google Authenticator's MigrationPayload built from them, as
 * google_auth.proto in beemdevelopment/Aegis describes it.
 */

export const varintBytes = (value: number): number[] => {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return out;
};

export type Field = [field: number, value: number | Uint8Array | string];

/** A message of these fields, numbers as varints and the rest length-delimited */
export const message = (fields: Field[]): Uint8Array => {
  const out: number[] = [];
  for (const [field, value] of fields) {
    if (typeof value === "number") {
      out.push(...varintBytes(field * 8), ...varintBytes(value));
      continue;
    }
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    out.push(...varintBytes(field * 8 + 2), ...varintBytes(bytes.length), ...bytes);
  }
  return new Uint8Array(out);
};

export type Otp = {
  secret: Uint8Array;
  name: string;
  issuer?: string | undefined;
  /** 1 SHA-1, 2 SHA-256, 3 SHA-512, 4 MD5 */
  algorithm?: number;
  /** 1 six, 2 eight */
  digits?: number;
  /** 1 HOTP, 2 TOTP */
  type?: number;
  counter?: number | undefined;
};

export const otpParameters = (otp: Otp): Uint8Array =>
  message([
    [1, otp.secret],
    [2, otp.name],
    ...(otp.issuer === undefined ? [] : ([[3, otp.issuer]] as Field[])),
    [4, otp.algorithm ?? 1],
    [5, otp.digits ?? 1],
    [6, otp.type ?? 2],
    ...(otp.counter === undefined ? [] : ([[7, otp.counter]] as Field[])),
  ]);

export type Batch = { size: number; index: number; id: number };

export const migrationPayload = (otps: Otp[], batch: Batch = { size: 1, index: 0, id: 1 }) =>
  message([
    ...otps.map((otp): Field => [1, otpParameters(otp)]),
    [2, 1],
    [3, batch.size],
    [4, batch.index],
    [5, batch.id],
  ]);

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** The link of a QR code, Base64 percent-encoded as Google writes it */
export const migrationLink = (payload: Uint8Array) =>
  `otpauth-migration://offline?data=${encodeURIComponent(base64(payload))}`;
