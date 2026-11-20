/**
 * A cheap, honest estimate of whether a password is weak (K-306 part 5, „Zum Ändern“): it runs
 * on the device only, over values that never leave it. Weak is a password from a list of very
 * common ones (also with digits or symbols around it, as "Password1!"), or one with fewer than
 * 60 bits by its length and the kinds of characters it uses, the generator's line for weak
 * (docs/plan.md, Generator). It sees no words of a language beyond the list, no keyboard rows and
 * no dates, so a password it lets pass is not proven strong.
 *
 * The list: the 1000 most common passwords of Mark Burnett's ten million passwords
 * (xato-net-10-million-passwords-1000.txt), from danielmiessler/SecLists (MIT), lowercased.
 */
import { strengthOf } from "@kennwort/core";
import common from "./common-passwords.json";

const COMMON: ReadonlySet<string> = new Set(common);

// How many characters each kind adds to what a guesser has to try
const KINDS: readonly [RegExp, number][] = [
  [/[a-z]/, 26],
  [/[A-Z]/, 26],
  [/[0-9]/, 10],
  [/[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/, 33],
  // Umlauts and every other letter beyond ASCII, counted generously as one large set
  [/[^\x20-\x7e]/, 100],
];

/**
 * Bits by length and kinds of characters; a run of the same character counts once, so
 * "aaaaaaaaaaaaaaaa" is as weak as "a"
 */
export const estimateBits = (password: string): number => {
  const chars = Array.from(password).filter((c, i, all) => i === 0 || c !== all[i - 1]);
  const pool = KINDS.reduce((sum, [kind, size]) => (kind.test(password) ? sum + size : sum), 0);
  return pool === 0 ? 0 : chars.length * Math.log2(pool);
};

/** The password without the digits and symbols around a word, lowercased: "Sommer2019!" → "sommer" */
const core = (password: string) => password.toLocaleLowerCase().replace(/^\P{L}+|\P{L}+$/gu, "");

export const isCommon = (password: string) => {
  const lower = password.toLocaleLowerCase();
  return COMMON.has(lower) || COMMON.has(core(password));
};

/** Weak: common, or under the generator's 60 bits; an empty password is not checked */
export const isWeak = (password: string): boolean =>
  password !== "" && (isCommon(password) || strengthOf(estimateBits(password)) === "weak");
