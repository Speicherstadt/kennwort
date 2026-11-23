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

/**
 * Characters that look alike in many fonts and are left out when asked: zero and capital/small O,
 * one, capital I, small i and l and the pipe. None of the symbols above is among them, the set
 * lists the pipe so it stays out should the symbols ever take it.
 */
export const AMBIGUOUS = "0Oo1Iil|";
/** How many digits or symbols a password must hold at least, when that kind is chosen */
export const MIN_COUNT = { min: 0, max: 9, initial: 1 };

export type PasswordOptions = {
  length: number;
  digits: boolean;
  symbols: boolean;
  /** Leave out the look-alikes in AMBIGUOUS; off when not given */
  avoidAmbiguous?: boolean;
  /** At least this many digits when digits are chosen; 1 when not given */
  minDigits?: number;
  /** At least this many symbols when symbols are chosen; 1 when not given */
  minSymbols?: number;
};
export type PassphraseOptions = {
  words: number;
  separator: string;
  capitalize: boolean;
  digit: boolean;
};

/** Clamped to the range; a value that is no number is the usual one */
const within = (
  value: number,
  { min, max, initial }: { min: number; max: number; initial: number },
) => (Number.isNaN(value) ? initial : Math.min(max, Math.max(min, Math.floor(value))));

type Kind = { chars: string; min: number };

const clean = (chars: string, avoid: boolean) =>
  avoid ? [...chars].filter((c) => !AMBIGUOUS.includes(c)).join("") : chars;

/** A minimum in its range; a value that is no number is the usual one */
const minimum = (value: number | undefined) => within(value ?? MIN_COUNT.initial, MIN_COUNT);

/**
 * The chosen kinds with how many of each a password holds at least: one lowercase and one capital
 * letter, the asked digits and symbols; the minimums are lowered (symbols first) so that they and
 * the two letters fit into the length
 */
const kindsOf = (options: PasswordOptions): Kind[] => {
  const length = within(options.length, PASSWORD_LENGTH);
  const room = length - 2;
  const digits = options.digits ? Math.min(room, minimum(options.minDigits)) : 0;
  const symbols = options.symbols ? Math.min(room - digits, minimum(options.minSymbols)) : 0;
  const avoid = options.avoidAmbiguous === true;
  return [
    { chars: clean(LOWER, avoid), min: 1 },
    { chars: clean(UPPER, avoid), min: 1 },
    ...(options.digits ? [{ chars: clean(DIGITS, avoid), min: digits }] : []),
    ...(options.symbols ? [{ chars: clean(SYMBOLS, avoid), min: symbols }] : []),
  ];
};

const pickFrom = (chars: string, below: RandomBelow) => chars[below(chars.length)] as string;

const binomials = (n: number) => {
  const rows: bigint[][] = [[1n]];
  for (let i = 1; i <= n; i++)
    rows.push(
      Array.from(
        { length: i + 1 },
        (_, k) => (rows[i - 1]?.[k - 1] ?? 0n) + (rows[i - 1]?.[k] ?? 0n),
      ),
    );
  return rows;
};

/**
 * Every split of the length into how many characters of each kind (each at least its minimum),
 * with the number of passwords that split has: the ways to place the kinds times the choices of
 * characters, exact, in BigInt
 */
const splitsOf = (length: number, kinds: Kind[]) => {
  const key = JSON.stringify([length, kinds]);
  const known = splitCache.get(key);
  if (known) return known;
  const splits = countSplits(length, kinds);
  splitCache.set(key, splits);
  return splits;
};
type Split = { counts: number[]; weight: bigint };
/** The splits per length and kinds, worked out once: the panel makes a password on every change */
const splitCache = new Map<string, Split[]>();

const countSplits = (length: number, kinds: Kind[]) => {
  const choose = binomials(length);
  const splits: Split[] = [];
  const walk = (at: number, left: number, counts: number[], weight: bigint) => {
    const kind = kinds[at] as Kind;
    if (at === kinds.length - 1) {
      if (left >= kind.min)
        splits.push({
          counts: [...counts, left],
          weight: weight * BigInt(kind.chars.length) ** BigInt(left),
        });
      return;
    }
    for (let n = kind.min; n <= left; n++)
      walk(
        at + 1,
        left - n,
        [...counts, n],
        weight * (choose[left]?.[n] ?? 0n) * BigInt(kind.chars.length) ** BigInt(n),
      );
  };
  walk(0, length, [], 1n);
  return splits;
};

/** A uniform BigInt below the bound: 32-bit pieces, the top one cut to the bound's bit length, drawn again at or above it */
const bigBelow = (bound: bigint, below: RandomBelow): bigint => {
  const bits = bound.toString(2).length;
  for (;;) {
    let value = BigInt(below(2 ** (bits % 32 || 32)));
    for (let left = bits - (bits % 32 || 32); left > 0; left -= 32)
      value = (value << 32n) | BigInt(below(2 ** 32));
    if (value < bound) return value;
  }
};

/** Fisher–Yates with uniform picks: every order is equally likely */
const shuffled = <T>(items: T[], below: RandomBelow): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

/**
 * Uniform over every password that holds the minimum of each kind, so passwordBits stays exact:
 * a split of the length into kinds is drawn with the weight of how many passwords it has, its
 * characters uniformly from their kind, then their order by Fisher–Yates. Given a split, each
 * placement of the kinds and each character is equally likely, so each valid password is too;
 * no kind is pinned to a place.
 */
export const password = (options: PasswordOptions, below: RandomBelow): string => {
  const length = within(options.length, PASSWORD_LENGTH);
  const kinds = kindsOf(options);
  const splits = splitsOf(length, kinds);
  let draw = bigBelow(
    splits.reduce((sum, split) => sum + split.weight, 0n),
    below,
  );
  const split =
    splits.find((s) => {
      if (draw < s.weight) return true;
      draw -= s.weight;
      return false;
    }) ?? (splits[0] as Split);
  const chars = kinds.flatMap((kind, i) =>
    Array.from({ length: split.counts[i] ?? 0 }, () => pickFrom(kind.chars, below)),
  );
  return shuffled(chars, below).join("");
};

/**
 * What a guesser who knows the options faces: log2 of the number of equally likely passwords,
 * rounded down, which for a whole number is its bit length less one
 */
export const passwordBits = (options: PasswordOptions): number => {
  const length = within(options.length, PASSWORD_LENGTH);
  const total = splitsOf(length, kindsOf(options)).reduce((sum, s) => sum + s.weight, 0n);
  return total.toString(2).length - 1;
};

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
