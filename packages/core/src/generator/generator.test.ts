import { digest, randomBytes } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { effLargeWords } from "./eff-large.ts";
import {
  AMBIGUOUS,
  DIGITS,
  LOWER,
  MIN_COUNT,
  PASSPHRASE_WORDS,
  PASSWORD_LENGTH,
  type PassphraseOptions,
  type PasswordOptions,
  passphrase,
  passphraseBits,
  password,
  passwordBits,
  randomBelow,
  SYMBOLS,
  strengthOf,
  UPPER,
} from "./generator.ts";

const below = randomBelow(randomBytes);
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
/** A byte source that hands out the given 32-bit numbers, big-endian, one per call */
const numbers = (...values: number[]) => {
  const queue = [...values];
  return (length: number) => {
    expect(length).toBe(4);
    const value = queue.shift();
    if (value === undefined) throw new Error("no more numbers");
    return new Uint8Array([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
  };
};

const allOn: PasswordOptions = { length: 20, digits: true, symbols: true };
const words: PassphraseOptions = { words: 5, separator: "-", capitalize: false, digit: false };

describe("randomBelow", () => {
  it("reads one big-endian 32-bit number and takes it modulo the bound", () => {
    expect(randomBelow(numbers(0x01020304))(1000)).toBe(0x01020304 % 1000);
    expect(randomBelow(numbers(7))(10)).toBe(7);
  });

  it("draws again above the last whole multiple of the bound, so no value comes up more often", () => {
    // 2^32 = 4294967296; for 10 the last whole multiple is 4294967290
    expect(randomBelow(numbers(4294967290, 4294967289))(10)).toBe(9);
    expect(randomBelow(numbers(4294967295, 4294967291, 3))(10)).toBe(3);
  });

  it("takes the number just below the limit and gives 0 for a bound of 1", () => {
    expect(randomBelow(numbers(4294967289))(10)).toBe(9);
    expect(randomBelow(numbers(4294967295))(1)).toBe(0);
  });

  it("refuses a bound that is not a whole number from 1 to 2^32", () => {
    for (const bound of [0, -1, 1.5, 2 ** 32 + 1, Number.NaN])
      expect(() => randomBelow(numbers())(bound)).toThrow(
        new RangeError("bound must be a whole number from 1 to 2^32"),
      );
    expect(randomBelow(numbers(5))(2 ** 32)).toBe(5);
  });
});

describe("password", () => {
  it("has the asked length, from 8 to 64 characters", () => {
    expect(password(allOn, below)).toHaveLength(20);
    expect(password({ ...allOn, length: 3 }, below)).toHaveLength(PASSWORD_LENGTH.min);
    expect(password({ ...allOn, length: 100 }, below)).toHaveLength(PASSWORD_LENGTH.max);
    expect(password({ ...allOn, length: 12.7 }, below)).toHaveLength(12);
    expect(PASSWORD_LENGTH).toEqual({ min: 8, max: 64, initial: 20 });
  });

  it("holds at least one character of every chosen kind and none of the others", () => {
    for (let i = 0; i < 200; i++) {
      const all = password({ length: 8, digits: true, symbols: true }, below);
      for (const kind of [LOWER, UPPER, DIGITS, SYMBOLS])
        expect([...all].some((c) => kind.includes(c))).toBe(true);
      const letters = password({ length: 8, digits: false, symbols: false }, below);
      expect(letters).toMatch(/^[a-zA-Z]{8}$/);
      expect([...letters].some((c) => LOWER.includes(c))).toBe(true);
      expect([...letters].some((c) => UPPER.includes(c))).toBe(true);
      expect(password({ length: 8, digits: true, symbols: false }, below)).toMatch(/\d/);
      expect(password({ length: 8, digits: false, symbols: true }, below)).not.toMatch(/\d/);
    }
  });

  it("uses every character of the kinds and puts the required ones anywhere", () => {
    const seen = new Set<string>();
    const firsts = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const made = password(allOn, below);
      for (const c of made) seen.add(c);
      firsts.add(made[0] as string);
    }
    expect([...seen].sort()).toEqual([...(LOWER + UPPER + DIGITS + SYMBOLS)].sort());
    // Every kind can come first: no kind has a fixed place
    for (const kind of [LOWER, UPPER, DIGITS, SYMBOLS])
      expect([...firsts].some((c) => kind.includes(c))).toBe(true);
  });

  it("knows its kinds of characters", () => {
    expect(LOWER).toBe("abcdefghijklmnopqrstuvwxyz");
    expect(UPPER).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(DIGITS).toBe("0123456789");
    expect(SYMBOLS).toBe("!#$%&*+-=?@^_");
  });

  it("draws a split by weight, the characters of each kind, then shuffles them", () => {
    // Letters only, 8 long: the draw 0 (two numbers for 46 bits) takes the first split (1 lowercase,
    // 7 capitals), then a, seven times A, then Fisher–Yates swaps with j = 0: the a moves last
    const given = randomBelow(numbers(...Array.from({ length: 17 }, () => 0)));
    expect(password({ length: 8, digits: false, symbols: false }, given)).toBe("AAAAAAAa");
  });

  it("is uniform over all passwords that hold every kind (review of K-306 part 3)", () => {
    // Letters only, 8 long: 8 · 26^8 of the 52^8 − 2 · 26^8 valid ones hold one lowercase letter
    const runs = 40_000;
    let oneLower = 0;
    for (let i = 0; i < runs; i++) {
      const made = password({ length: 8, digits: false, symbols: false }, below);
      if ([...made].filter((c) => LOWER.includes(c)).length === 1) oneLower++;
    }
    expect(Math.abs(oneLower / runs - 8 / 254)).toBeLessThan(0.004);
  });

  it("takes a length that is no number as the usual one (review of K-306 part 3)", () => {
    expect(password({ ...allOn, length: Number.NaN }, below)).toHaveLength(PASSWORD_LENGTH.initial);
    expect(password({ ...allOn, length: Number.POSITIVE_INFINITY }, below)).toHaveLength(64);
    expect(passwordBits({ ...allOn, length: Number.NaN })).toBe(124);
  });

  it("is the same for the same random numbers", () => {
    const fixed = () => randomBelow(numbers(...Array.from({ length: 64 }, (_, i) => i * 7919)));
    expect(password(allOn, fixed())).toBe(password(allOn, fixed()));
  });
});

describe("password options: ambiguous characters and minimum counts", () => {
  const count = (made: string, kind: string) => [...made].filter((c) => kind.includes(c)).length;

  it("knows the ambiguous characters and the range of the minimums", () => {
    expect(AMBIGUOUS).toBe("0Oo1Iil|");
    expect(MIN_COUNT).toEqual({ min: 0, max: 9, initial: 1 });
  });

  it("never yields an ambiguous character when asked to avoid them, but uses all others", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const made = password({ ...allOn, avoidAmbiguous: true }, below);
      for (const c of made) {
        expect(AMBIGUOUS).not.toContain(c);
        seen.add(c);
      }
    }
    const expected = [...(LOWER + UPPER + DIGITS + SYMBOLS)].filter((c) => !AMBIGUOUS.includes(c));
    expect([...seen].sort()).toEqual(expected.sort());
  });

  it("always holds the minimum digits and symbols and keeps the length", () => {
    for (let i = 0; i < 500; i++) {
      const made = password(
        { length: 12, digits: true, symbols: true, minDigits: 4, minSymbols: 3 },
        below,
      );
      expect(made).toHaveLength(12);
      expect(count(made, DIGITS)).toBeGreaterThanOrEqual(4);
      expect(count(made, SYMBOLS)).toBeGreaterThanOrEqual(3);
      expect(count(made, LOWER)).toBeGreaterThanOrEqual(1);
      expect(count(made, UPPER)).toBeGreaterThanOrEqual(1);
    }
  });

  it("fills the whole length when the minimums and the two letters take all of it", () => {
    for (let i = 0; i < 200; i++) {
      const made = password(
        { length: 8, digits: true, symbols: true, minDigits: 3, minSymbols: 3 },
        below,
      );
      expect(made).toHaveLength(8);
      expect(count(made, DIGITS)).toBe(3);
      expect(count(made, SYMBOLS)).toBe(3);
      expect(count(made, LOWER)).toBe(1);
      expect(count(made, UPPER)).toBe(1);
    }
  });

  it("lowers minimums that do not fit, symbols first, and ignores those of kinds not chosen", () => {
    for (let i = 0; i < 200; i++) {
      const made = password(
        { length: 8, digits: true, symbols: true, minDigits: 9, minSymbols: 9 },
        below,
      );
      expect(made).toHaveLength(8);
      expect(count(made, DIGITS)).toBe(6);
      const none = password(
        { length: 8, digits: false, symbols: false, minDigits: 9, minSymbols: 9 },
        below,
      );
      expect(none).toMatch(/^[a-zA-Z]{8}$/);
    }
    expect(
      passwordBits({ length: 8, digits: true, symbols: true, minDigits: 9, minSymbols: 9 }),
    ).toBe(passwordBits({ length: 8, digits: true, symbols: true, minDigits: 6, minSymbols: 0 }));
  });

  it("holds for random options (property)", () => {
    for (let i = 0; i < 300; i++) {
      const options: PasswordOptions = {
        length: PASSWORD_LENGTH.min + below(PASSWORD_LENGTH.max - PASSWORD_LENGTH.min + 1),
        digits: below(2) === 1,
        symbols: below(2) === 1,
        avoidAmbiguous: below(2) === 1,
        minDigits: below(10),
        minSymbols: below(10),
      };
      const made = password(options, below);
      expect(made).toHaveLength(options.length);
      const room = options.length - 2;
      const digits = options.digits ? Math.min(room, options.minDigits ?? 1) : 0;
      const symbols = options.symbols ? Math.min(room - digits, options.minSymbols ?? 1) : 0;
      expect(count(made, DIGITS)).toBeGreaterThanOrEqual(digits);
      expect(count(made, SYMBOLS)).toBeGreaterThanOrEqual(symbols);
      if (!options.digits) expect(count(made, DIGITS)).toBe(0);
      if (!options.symbols) expect(count(made, SYMBOLS)).toBe(0);
      if (options.avoidAmbiguous) for (const c of made) expect(AMBIGUOUS).not.toContain(c);
      expect(count(made, LOWER)).toBeGreaterThanOrEqual(1);
      expect(count(made, UPPER)).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not pin the required characters to places", () => {
    // 8 long, 3 digits and 3 symbols required: every place holds a digit 3/8 of the time
    const runs = 8000;
    const digitsAt = Array.from({ length: 8 }, () => 0);
    for (let i = 0; i < runs; i++) {
      const made = password(
        { length: 8, digits: true, symbols: true, minDigits: 3, minSymbols: 3 },
        below,
      );
      [...made].forEach((c, at) => {
        if (DIGITS.includes(c)) digitsAt[at] = (digitsAt[at] ?? 0) + 1;
      });
    }
    for (const n of digitsAt) expect(Math.abs(n / runs - 3 / 8)).toBeLessThan(0.03);
  });

  it("counts fewer bits for fewer characters and more required ones", () => {
    expect(passwordBits({ ...allOn, minDigits: 1, minSymbols: 1 })).toBe(124);
    expect(passwordBits({ ...allOn, avoidAmbiguous: true })).toBeLessThan(124);
    expect(passwordBits({ ...allOn, minDigits: 5, minSymbols: 5 })).toBeLessThan(124);
    // Only a split is left: 1 lowercase, 1 capital, 3 digits, 3 symbols placed in 8!/(3!·3!) ways
    const exact = 1120n * 26n * 26n * 10n ** 3n * 13n ** 3n;
    expect(
      passwordBits({ length: 8, digits: true, symbols: true, minDigits: 3, minSymbols: 3 }),
    ).toBe(exact.toString(2).length - 1);
  });
});

describe("passwordBits", () => {
  // Expected: floor(log2) of the number of valid passwords by inclusion–exclusion, worked out
  // independently with Python's integers
  it("counts the bits of all passwords that hold every chosen kind, rounded down", () => {
    expect(passwordBits(allOn)).toBe(124);
    expect(passwordBits({ length: 8, digits: false, symbols: false })).toBe(45);
    expect(passwordBits({ length: 8, digits: true, symbols: true })).toBe(48);
    expect(passwordBits({ length: 10, digits: true, symbols: false })).toBe(59);
    expect(passwordBits({ length: 10, digits: false, symbols: true })).toBe(60);
    expect(passwordBits({ length: 13, digits: true, symbols: true })).toBe(80);
    expect(passwordBits({ length: 32, digits: false, symbols: false })).toBe(182);
    expect(passwordBits({ ...allOn, length: 200 })).toBe(398);
  });
});

describe("passphrase", () => {
  it("joins the asked number of words from the list, from 3 to 10", () => {
    const made = passphrase(words, effLargeWords, below).split("-");
    // Four words of the list hold a hyphen themselves (drop-down, felt-tip, t-shirt, yo-yo)
    expect(made.length).toBeGreaterThanOrEqual(5);
    expect(
      passphrase({ ...words, separator: " ", words: 1 }, effLargeWords, below).split(" "),
    ).toHaveLength(PASSPHRASE_WORDS.min);
    expect(
      passphrase({ ...words, separator: " ", words: 40 }, effLargeWords, below).split(" "),
    ).toHaveLength(PASSPHRASE_WORDS.max);
    expect(PASSPHRASE_WORDS).toEqual({ min: 3, max: 10, initial: 5 });
  });

  it("takes a word count that is no number as the usual one (review of K-306 part 3)", () => {
    const made = passphrase({ ...words, words: Number.NaN, separator: " " }, effLargeWords, below);
    expect(made.split(" ")).toHaveLength(PASSPHRASE_WORDS.initial);
    expect(passphraseBits({ ...words, words: Number.NaN }, 7776)).toBe(64);
  });

  it("takes words by the random numbers and puts the separator between them", () => {
    const list = ["apfel", "birne", "kirsche", "pflaume"];
    expect(passphrase({ ...words, words: 3 }, list, randomBelow(numbers(0, 3, 6)))).toBe(
      "apfel-pflaume-kirsche",
    );
    expect(
      passphrase({ ...words, words: 3, separator: "." }, list, randomBelow(numbers(1, 1, 2))),
    ).toBe("birne.birne.kirsche");
  });

  it("capitalizes every word when asked", () => {
    const list = ["apfel", "birne"];
    expect(
      passphrase({ ...words, words: 3, capitalize: true }, list, randomBelow(numbers(0, 1, 0))),
    ).toBe("Apfel-Birne-Apfel");
  });

  it("puts a digit after one word chosen at random when asked", () => {
    const list = ["apfel", "birne"];
    // Words 0, 1, 0, then the word that gets the digit (1), then the digit (7)
    expect(
      passphrase({ ...words, words: 3, digit: true }, list, randomBelow(numbers(0, 1, 0, 1, 7))),
    ).toBe("apfel-birne7-apfel");
    expect(
      passphrase({ ...words, words: 3, digit: true }, list, randomBelow(numbers(1, 1, 1, 0, 0))),
    ).toBe("birne0-birne-birne");
  });

  it("uses the whole EFF list, whose words it knows by their digest", () => {
    expect(effLargeWords).toHaveLength(7776);
    expect(new Set(effLargeWords).size).toBe(7776);
    expect(effLargeWords[0]).toBe("abacus");
    expect(effLargeWords.at(-1)).toBe("zoom");
    expect(hex(digest(new TextEncoder().encode(effLargeWords.join(" "))))).toBe(
      "b2fc429e01b7654b44d18fbb1418fea475230226d8d8447fb66d412afa949773",
    );
  });
});

describe("passphraseBits", () => {
  it("counts the bits of every word, plus the digit, rounded down", () => {
    expect(passphraseBits(words, 7776)).toBe(Math.floor(5 * Math.log2(7776)));
    expect(passphraseBits({ ...words, digit: true }, 7776)).toBe(
      Math.floor(5 * Math.log2(7776) + Math.log2(10)),
    );
    expect(passphraseBits({ ...words, words: 99 }, 7776)).toBe(Math.floor(10 * Math.log2(7776)));
    // Capitals on every word add nothing an attacker does not know
    expect(passphraseBits({ ...words, capitalize: true }, 7776)).toBe(64);
  });
});

describe("strengthOf", () => {
  it("is weak below 60 bits, good below 80 and strong from 80", () => {
    expect([0, 59, 60, 79, 80, 200].map(strengthOf)).toEqual([
      "weak",
      "weak",
      "good",
      "good",
      "strong",
      "strong",
    ]);
  });
});
