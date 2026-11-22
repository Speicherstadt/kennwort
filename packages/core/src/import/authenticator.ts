/**
 * What the authenticator exports have in common (K-503): each account becomes a login with its
 * one-time code as an otpauth link, titled by the issuer. Kennwort works out TOTP codes only
 * (SHA-1, SHA-256, SHA-512; six to eight digits), so HOTP, Steam and other kinds are left out
 * and counted; which settings fit is what parseTotp accepts, so the import and the code shown
 * later never disagree.
 */
import { base32Decode, parseTotp, totpLink } from "../totp/otpauth.ts";
import { login } from "./entry.ts";
import type { ImportedEntry, ImportResult } from "./types.ts";

export type OtpAccount = {
  issuer: string;
  account: string;
  secret: Uint8Array;
  /** As the export names it, any case; undefined for one the export has no name for */
  algorithm: string | undefined;
  digits: number;
  period: number;
  notes?: string | undefined;
  favorite?: boolean | undefined;
  folders?: string[] | undefined;
};

/** A key the export wrote in Base32; one that is not Base32 reads as empty, which no code takes */
export const fromBase32 = (text: string): Uint8Array => {
  const secret = base32Decode(text);
  return secret.ok ? secret.value : new Uint8Array();
};

/** The login of a TOTP account, or nothing for one whose codes Kennwort cannot work out */
export const otpEntry = (otp: OtpAccount): ImportedEntry | undefined => {
  if (otp.algorithm === undefined) return undefined;
  const [issuer, account] = [otp.issuer.trim(), otp.account.trim()];
  const link = totpLink({ ...otp, issuer, account, algorithm: otp.algorithm.toUpperCase() });
  if (!parseTotp(link).ok) return undefined;
  return login({
    title: issuer,
    username: account,
    totp: link,
    notes: otp.notes,
    favorite: otp.favorite,
    folders: otp.folders,
  });
};

/** The entries read, and how many accounts were left out */
export const withSkipped = (entries: (ImportedEntry | undefined)[]): ImportResult => {
  const read = entries.filter((entry) => entry !== undefined);
  return { ok: true, value: read, skipped: entries.length - read.length };
};
