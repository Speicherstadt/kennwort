import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import common from "./common-passwords.json";
import { estimateBits, isCommon, isWeak } from "./password-check.ts";

// K-306 part 5: a cheap estimate of a weak password, on the device only
describe("weak passwords", () => {
  it("uses the whole list of common passwords, lowercased, which it knows by its digest", () => {
    expect(common).toHaveLength(997);
    expect(common.every((word) => word === word.toLowerCase())).toBe(true);
    expect(createHash("sha256").update(common.join("\n")).digest("hex")).toBe(
      "88c3250951e6b602d8a55309de40ffbcf92f288a00ff766a58d8768bdafb8ee8",
    );
  });

  it("counts bits by length and the kinds of characters used", () => {
    expect(estimateBits("")).toBe(0);
    expect(estimateBits("abcdefgh")).toBeCloseTo(8 * Math.log2(26));
    expect(estimateBits("abcDEF12")).toBeCloseTo(8 * Math.log2(62));
    expect(estimateBits("ab-D")).toBeCloseTo(4 * Math.log2(26 + 26 + 33));
    expect(estimateBits("a b")).toBeCloseTo(3 * Math.log2(26 + 33));
    expect(estimateBits("1234")).toBeCloseTo(4 * Math.log2(10));
    expect(estimateBits("äöü")).toBeCloseTo(3 * Math.log2(100));
    // A run of one character counts once
    expect(estimateBits("aaaaaaaaaaaaaaaaaaaa")).toBeCloseTo(Math.log2(26));
    expect(estimateBits("abab")).toBeCloseTo(4 * Math.log2(26));
  });

  it("knows a common password also with digits or symbols around it, in any case", () => {
    expect(isCommon("password")).toBe(true);
    expect(isCommon("PassWord")).toBe(true);
    expect(isCommon("Password1!")).toBe(true);
    expect(isCommon("!!dragon2024")).toBe(true);
    expect(isCommon("123456")).toBe(true);
    expect(isCommon("Heizung-Wasser")).toBe(false);
    // Only the word itself, not a word inside a longer one
    expect(isCommon("mydragonhouse")).toBe(false);
  });

  it("calls weak what is common or under the generator's 60 bits, and leaves an empty one", () => {
    expect(isWeak("")).toBe(false);
    expect(isWeak("sommer2019")).toBe(true);
    expect(isWeak("Password123456789!")).toBe(true);
    expect(isWeak("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(isWeak("Weber-2026!")).toBe(false);
    expect(isWeak("Heizung-Wasser-Licht-42")).toBe(false);
    expect(isWeak("kessel ventil rohr pumpe")).toBe(false);
    // As docs/eintraege.md says: no German words, "Sommer2019" weak for its length only
    expect(isCommon("Passwort")).toBe(false);
    expect(isCommon("qwertz")).toBe(false);
    expect(isWeak("Sommer2019")).toBe(true);
    expect(isWeak("Sommer2019!xyz")).toBe(false);
    // 60 bits is the line: 13 lowercase letters have 61.1 bits, 12 have 56.4
    expect(isWeak("qwmnbvcxzlkjh")).toBe(false);
    expect(isWeak("qwmnbvcxzlkj")).toBe(true);
  });
});
