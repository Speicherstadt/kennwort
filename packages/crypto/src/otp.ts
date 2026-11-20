/**
 * One-time codes (K-306 part 4): HOTP of RFC 4226 over HMAC from @noble/hashes, and TOTP of
 * RFC 6238, the counter being the seconds since 1970 divided by the period. Only the truncation
 * of the RFC lives here; the primitives are noble's.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

export const OTP_ALGORITHMS = ["SHA1", "SHA256", "SHA512"] as const;
export type OtpAlgorithm = (typeof OTP_ALGORITHMS)[number];
export type TotpOptions = { digits: number; period: number; algorithm: OtpAlgorithm };

const HASHES = { SHA1: sha1, SHA256: sha256, SHA512: sha512 };

/** The counter as 8 bytes big-endian, from its high and low 32-bit words */
const counterBytes = (counter: number) => {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter % 2 ** 32);
  return bytes;
};

export const hotp = (
  key: Uint8Array,
  counter: number,
  digits: number,
  algorithm: OtpAlgorithm,
): string => {
  if (digits !== 6 && digits !== 7 && digits !== 8)
    throw new RangeError("digits must be 6, 7 or 8");
  if (!Number.isSafeInteger(counter) || counter < 0)
    throw new RangeError("counter must be a whole number from 0 to 2^53 - 1");
  const mac = hmac(HASHES[algorithm], key, counterBytes(counter));
  // Dynamic truncation (RFC 4226, 5.3): four bytes from the offset the last nibble names
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const binary = new DataView(mac.buffer, mac.byteOffset).getUint32(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
};

/** The code at a time (seconds since 1970) and how many whole seconds it still holds */
export const totp = (key: Uint8Array, seconds: number, options: TotpOptions) => {
  if (!Number.isInteger(options.period) || options.period < 1)
    throw new RangeError("period must be a whole number of seconds from 1");
  const step = Math.floor(seconds / options.period);
  return {
    code: hotp(key, step, options.digits, options.algorithm),
    remaining: (step + 1) * options.period - Math.floor(seconds),
  };
};
