/**
 * One-time code keys as services hand them out (K-306 part 4): an otpauth link (Google's Key URI
 * format) or a bare Base32 key typed from a setup page. The stored value stays as given; codes are
 * worked out from it when shown, by RFC 6238 in @kennwort/crypto.
 */
import { OTP_ALGORITHMS, type OtpAlgorithm, type Result, totp } from "@kennwort/crypto";
import { err, ok } from "../result.ts";

export type TotpKey = {
  secret: Uint8Array;
  issuer: string;
  account: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
};
export type TotpError = "bad-secret" | "unsupported";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** Lengths (mod 8) after which a Base32 text cannot end on a whole byte (RFC 4648, section 6) */
const PARTIAL = new Set([1, 3, 6]);

/** RFC 4648 Base32, any case, padding and spaces left out */
export const base32Decode = (text: string): Result<Uint8Array, "bad-secret"> => {
  const clean = text.replace(/\s/g, "").replace(/=+$/, "").toUpperCase();
  if (PARTIAL.has(clean.length % 8)) return err("bad-secret");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return err("bad-secret");
    buffer = ((buffer << 5) | value) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return ok(new Uint8Array(bytes));
};

const DEFAULTS = {
  issuer: "",
  account: "",
  algorithm: "SHA1" as OtpAlgorithm,
  digits: 6,
  period: 30,
};

const decoded = (text: string): Result<string, "bad-secret"> => {
  try {
    return ok(decodeURIComponent(text));
  } catch {
    return err("bad-secret");
  }
};

/** "Issuer:account" or "account", as the label of the link has it */
const labelParts = (label: string) => {
  const at = label.indexOf(":");
  return at < 0
    ? { issuer: "", account: label.trim() }
    : { issuer: label.slice(0, at).trim(), account: label.slice(at + 1).trim() };
};

/** A number parameter; one that does not parse is NaN, which the range check then refuses */
const whole = (text: string | null, fallback: number) => (text === null ? fallback : Number(text));

/** The text as an otpauth link, if it is one; the URL parser drops spaces around it */
const asLink = (text: string) => {
  const url = URL.canParse(text) ? new URL(text) : undefined;
  return url?.protocol === "otpauth:" ? url : undefined;
};

const fromLink = (link: URL): Result<TotpKey, TotpError> => {
  if (link.host.toLowerCase() !== "totp") return err("unsupported");
  const label = decoded(link.pathname.slice(1));
  const secretText = link.searchParams.get("secret");
  if (!label.ok) return label;
  if (secretText === null) return err("bad-secret");
  const secret = base32Decode(secretText);
  if (!secret.ok || secret.value.length === 0) return err("bad-secret");
  const params = link.searchParams;
  const algorithm = OTP_ALGORITHMS.find((a) => a === params.get("algorithm")?.toUpperCase());
  const digits = whole(params.get("digits"), DEFAULTS.digits);
  const period = whole(params.get("period"), DEFAULTS.period);
  // A number that does not parse is NaN, which no comparison catches: whole numbers only
  const fits = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if ((params.has("algorithm") && !algorithm) || !fits(digits, 6, 8) || !fits(period, 1, 86_400))
    return err("unsupported");
  const parts = labelParts(label.value);
  return ok({
    secret: secret.value,
    issuer: params.get("issuer") ?? parts.issuer,
    account: parts.account,
    algorithm: algorithm ?? DEFAULTS.algorithm,
    digits,
    period,
  });
};

/** An otpauth link, or a bare Base32 key with the usual settings */
export const parseTotp = (value: string): Result<TotpKey, TotpError> => {
  const link = asLink(value);
  if (link) return fromLink(link);
  const secret = base32Decode(value);
  return secret.ok && secret.value.length > 0
    ? ok({ ...DEFAULTS, secret: secret.value })
    : err("bad-secret");
};

/** The code of a stored value at a time (milliseconds, as Date.now gives) */
export const totpCode = (value: string, nowMs: number) => {
  const key = parseTotp(value);
  return key.ok ? ok(totp(key.value.secret, nowMs / 1000, key.value)) : key;
};
