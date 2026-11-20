import { digest, randomBytes } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { effLargeWords } from "./eff-large.ts";
import {
  DIGITS,
  LOWER,
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

  it("draws whole passwords from all chosen characters until one holds every kind", () => {
    // First a-h (no capital: drawn again), then a A b B c C d D
    const given = randomBelow(numbers(0, 1, 2, 3, 4, 5, 6, 7, 0, 26, 1, 27, 2, 28, 3, 29));
    expect(password({ length: 8, digits: false, symbols: false }, given)).toBe("aAbBcCdD");
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
