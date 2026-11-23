/**
 * The SHA-1 of a password for the k-anonymity range query of Have I Been Pwned's Pwned Passwords
 * (K-603, docs/sicherheitsdesign.md P-23). SHA-1 protects nothing here: it is only the name the
 * leak list files each password under. Only the first five hex characters leave the device; the
 * other 35 are compared on the device with the range the service sends back.
 *
 * The password goes in as the UTF-8 of what is stored, without normalisation, as the list hashed
 * what leaked; the hex is upper case, as the API writes it (haveibeenpwned.com/API/v3).
 */
import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const PWNED_PREFIX_LENGTH = 5;

export type PwnedHash = { prefix: string; suffix: string };

export const pwnedHash = (password: string): PwnedHash => {
  const hex = bytesToHex(sha1(utf8ToBytes(password))).toUpperCase();
  return { prefix: hex.slice(0, PWNED_PREFIX_LENGTH), suffix: hex.slice(PWNED_PREFIX_LENGTH) };
};
