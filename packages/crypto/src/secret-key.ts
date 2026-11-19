/**
 * Keys as people see them, to type, print or read aloud: a prefix, the key's bits in Crockford
 * Base32 in groups of five, and one check symbol (Crockford's mod-37 check), which catches every
 * single changed character. Parsing ignores case, hyphens and spaces and reads O as 0 and I, L as 1.
 *
 *   Secret Key (F-05), 128 bits:   K1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X-C
 *   Recovery Key (P-12), 256 bits: R1- and 52 digits in 11 groups, then the check symbol
 */
import { err, ok, type Result } from "./result.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK_SYMBOLS = `${ALPHABET}*~$=U`;

export type KeyTextError = "wrong-prefix" | "wrong-length" | "invalid-character" | "wrong-check";
/** The errors of a Secret Key, as of a Recovery Key */
export type SecretKeyError = KeyTextError;
type Codec = { prefix: string; length: number };

const SECRET_KEY: Codec = { prefix: "K1", length: 16 };
const RECOVERY_KEY: Codec = { prefix: "R1", length: 32 };

const digitsOf = ({ length }: Codec) => Math.ceil((length * 8) / 5);

const toNumber = (bytes: Uint8Array) =>
  bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);

const toBytes = (value: bigint, length: number) =>
  Uint8Array.from({ length }, (_, index) =>
    Number((value >> (8n * BigInt(length - 1 - index))) & 0xffn),
  );

const checkSymbol = (value: bigint) => CHECK_SYMBOLS.charAt(Number(value % 37n));

const format = (codec: Codec, key: Uint8Array): string => {
  if (key.length !== codec.length) throw new RangeError(`key must be ${codec.length} bytes`);
  const value = toNumber(key);
  const count = digitsOf(codec);
  const digits = Array.from({ length: count }, (_, index) =>
    ALPHABET.charAt(Number((value >> (5n * BigInt(count - 1 - index))) & 31n)),
  ).join("");
  const groups = Array.from({ length: Math.ceil(count / 5) }, (_, index) =>
    digits.slice(5 * index, 5 * index + 5),
  );
  return [codec.prefix, ...groups, checkSymbol(value)].join("-");
};

const normalize = (text: string) =>
  text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

const parse = (codec: Codec, text: string): Result<Uint8Array, KeyTextError> => {
  const compact = normalize(text);
  if (!compact.startsWith(codec.prefix)) return err("wrong-prefix");
  const body = compact.slice(codec.prefix.length);
  const count = digitsOf(codec);
  if (body.length !== count + 1) return err("wrong-length");
  const digits = body.slice(0, count);
  if ([...digits].some((char) => !ALPHABET.includes(char))) return err("invalid-character");
  const value = [...digits].reduce((sum, char) => sum * 32n + BigInt(ALPHABET.indexOf(char)), 0n);
  if (value >> BigInt(codec.length * 8) !== 0n) return err("invalid-character");
  if (body.slice(count) !== checkSymbol(value)) return err("wrong-check");
  return ok(toBytes(value, codec.length));
};

export const formatSecretKey = (key: Uint8Array) => format(SECRET_KEY, key);
export const parseSecretKey = (text: string) => parse(SECRET_KEY, text);
export const formatRecoveryKey = (key: Uint8Array) => format(RECOVERY_KEY, key);
export const parseRecoveryKey = (text: string) => parse(RECOVERY_KEY, text);
