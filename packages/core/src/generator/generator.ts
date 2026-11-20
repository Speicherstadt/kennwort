/**
 * The generator for passwords and passphrases (K-306): pure functions over a source of random
 * numbers that is passed in, so the web app, the extension and the tests share them. Every pick is
 * uniform: random numbers come by rejection sampling, never by a bare modulo.
 */

/** A uniform whole number from 0 up to (not including) the bound */
export type RandomBelow = (bound: number) => number;

const RANGE = 2 ** 32;

/**
 * Uniform numbers from a byte source (crypto.getRandomValues through @kennwort/crypto): a 32-bit
 * number at or above the last whole multiple of the bound is drawn again, so every value is equally
 * likely
 */
export const randomBelow =
  (randomBytes: (length: number) => Uint8Array): RandomBelow =>
  (bound) => {
    if (!Number.isInteger(bound) || bound < 1 || bound > RANGE)
      throw new RangeError("bound must be a whole number from 1 to 2^32");
    const limit = RANGE - (RANGE % bound);
    for (;;) {
      const [a = 0, b = 0, c = 0, d = 0] = randomBytes(4);
      const value = a * 2 ** 24 + b * 2 ** 16 + c * 2 ** 8 + d;
      if (value < limit) return value % bound;
    }
  };

export const LOWER = "abcdefghijklmnopqrstuvwxyz";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";
/** Symbols most sign-up forms take */
export const SYMBOLS = "!#$%&*+-=?@^_";

export const PASSWORD_LENGTH = { min: 8, max: 64, initial: 20 };
export const PASSPHRASE_WORDS = { min: 3, max: 10, initial: 5 };

export type PasswordOptions = { length: number; digits: boolean; symbols: boolean };
export type PassphraseOptions = {
  words: number;
  separator: string;
  capitalize: boolean;
  digit: boolean;
};

const within = (value: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Math.floor(value)));

const kindsOf = (options: PasswordOptions) => [
  LOWER,
  UPPER,
  ...(options.digits ? [DIGITS] : []),
  ...(options.symbols ? [SYMBOLS] : []),
];

const pickFrom = (chars: string, below: RandomBelow) => chars[below(chars.length)] as string;

/** Fisher–Yates with uniform picks: every order is equally likely */
const shuffled = (items: string[], below: RandomBelow) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [result[i], result[j]] = [result[j] as string, result[i] as string];
  }
  return result;
};

/** One character of every chosen kind, the rest from all of them, then shuffled */
export const password = (options: PasswordOptions, below: RandomBelow): string => {
  const length = within(options.length, PASSWORD_LENGTH);
  const kinds = kindsOf(options);
  const all = kinds.join("");
  const required = kinds.map((kind) => pickFrom(kind, below));
  const rest = Array.from({ length: length - required.length }, () => pickFrom(all, below));
  return shuffled([...required, ...rest], below).join("");
};

/** What a guesser who knows the options faces, rounded down */
export const passwordBits = (options: PasswordOptions): number =>
  Math.floor(within(options.length, PASSWORD_LENGTH) * Math.log2(kindsOf(options).join("").length));

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Words picked uniformly from the list; a digit, if asked, goes after one word picked at random */
export const passphrase = (
  options: PassphraseOptions,
  list: readonly string[],
  below: RandomBelow,
): string => {
  const count = within(options.words, PASSPHRASE_WORDS);
  const picked = Array.from({ length: count }, () => list[below(list.length)] as string);
  const shaped = options.capitalize ? picked.map(capitalized) : picked;
  if (!options.digit) return shaped.join(options.separator);
  const at = below(count);
  const digit = pickFrom(DIGITS, below);
  return shaped.map((word, i) => (i === at ? word + digit : word)).join(options.separator);
};

/** The words' bits and the digit's; capitals on every word add nothing a guesser does not know */
export const passphraseBits = (options: PassphraseOptions, listSize: number): number =>
  Math.floor(
    within(options.words, PASSPHRASE_WORDS) * Math.log2(listSize) +
      (options.digit ? Math.log2(10) : 0),
  );

export type Strength = "weak" | "good" | "strong";

export const strengthOf = (bits: number): Strength =>
  bits < 60 ? "weak" : bits < 80 ? "good" : "strong";
