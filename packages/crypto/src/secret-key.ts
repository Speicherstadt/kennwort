/**
 * The Secret Key as people see it (F-05): "K1-" and 26 characters of Crockford Base32 for its 128
 * bits, then one check symbol (Crockford's mod-37 check), in groups for reading aloud:
 * K1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X-C. Parsing ignores case, hyphens and spaces and reads O as 0
 * and I, L as 1, as Crockford Base32 does.
 */
import { err, ok, type Result } from "./result.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK_SYMBOLS = `${ALPHABET}*~$=U`;
const PREFIX = "K1";
const DIGITS = 26;
const BITS = 128n;

export type SecretKeyError = "wrong-prefix" | "wrong-length" | "invalid-character" | "wrong-check";

const toNumber = (bytes: Uint8Array) =>
  bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);

const toBytes = (value: bigint) =>
  Uint8Array.from({ length: Number(BITS / 8n) }, (_, index) =>
    Number((value >> (8n * BigInt(15 - index))) & 0xffn),
  );

const checkSymbol = (value: bigint) => CHECK_SYMBOLS.charAt(Number(value % 37n));

export const formatSecretKey = (secretKey: Uint8Array): string => {
  if (secretKey.length !== 16) throw new RangeError("secret key must be 16 bytes");
  const value = toNumber(secretKey);
  const digits = Array.from({ length: DIGITS }, (_, index) =>
    ALPHABET.charAt(Number((value >> (5n * BigInt(DIGITS - 1 - index))) & 31n)),
  ).join("");
  const groups = Array.from({ length: 6 }, (_, index) => digits.slice(5 * index, 5 * index + 5));
  return [PREFIX, ...groups, checkSymbol(value)].join("-");
};

const normalize = (text: string) =>
  text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

export const parseSecretKey = (text: string): Result<Uint8Array, SecretKeyError> => {
  const compact = normalize(text);
  if (!compact.startsWith(PREFIX)) return err("wrong-prefix");
  const body = compact.slice(PREFIX.length);
  if (body.length !== DIGITS + 1) return err("wrong-length");
  const digits = body.slice(0, DIGITS);
  if ([...digits].some((char) => !ALPHABET.includes(char))) return err("invalid-character");
  const value = [...digits].reduce((sum, char) => sum * 32n + BigInt(ALPHABET.indexOf(char)), 0n);
  if (value >> BITS !== 0n) return err("invalid-character");
  if (body.slice(DIGITS) !== checkSymbol(value)) return err("wrong-check");
  return ok(toBytes(value));
};
