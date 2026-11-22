/**
 * A range of Have I Been Pwned's Pwned Passwords (K-603, docs/sicherheitsdesign.md P-23): for a
 * five-character prefix of SHA-1, every suffix the leak list has under it with how often it
 * leaked, one `SUFFIX:COUNT` per line (haveibeenpwned.com/API/v3#PwnedPasswords). With the header
 * `Add-Padding: true` the service adds made-up suffixes with count 0, so that every answer has
 * about the same size; they are left out here. Read the same on the server, before it passes a
 * range on, and on the device, which compares the suffixes.
 */
import { err, ok, type Result } from "../result.ts";

const PREFIX = /^[0-9A-F]{5}$/;
const LINE = /^([0-9A-F]{35}):(\d{1,12})$/i;

/** Exactly five upper-case hex characters: nothing else may leave the device or the server */
export const isRangePrefix = (text: string) => PREFIX.test(text);

/** Suffix (upper case) → how often it leaked; padding lines (count 0) are dropped */
export const parseRange = (text: string): Result<ReadonlyMap<string, number>, "malformed"> => {
  const counts = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  // The answer may end with a line break; any other empty line is not a range
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const match = LINE.exec(line);
    if (!match) return err("malformed");
    const count = Number(match[2]);
    if (count > 0) counts.set(String(match[1]).toUpperCase(), count);
  }
  return ok(counts);
};
