import { describe, expect, it } from "vitest";
import { hotp, OTP_ALGORITHMS, totp } from "./otp.ts";

// RFC 4226 Appendix D and RFC 6238 Appendix B; checked against Python's hmac and hashlib
const ascii = (text: string) => new TextEncoder().encode(text);
const seed20 = ascii("12345678901234567890");
const seed32 = ascii("12345678901234567890123456789012");
const seed64 = ascii("1234567890123456789012345678901234567890123456789012345678901234");

describe("hotp (RFC 4226)", () => {
  it("gives the codes of Appendix D for counters 0 to 9", () => {
    expect(Array.from({ length: 10 }, (_, c) => hotp(seed20, c, 6, "SHA1"))).toEqual([
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ]);
  });

  it("keeps leading zeros", () => {
    expect(totp(seed20, 1111111109, { digits: 8, period: 30, algorithm: "SHA1" }).code).toBe(
      "07081804",
    );
  });

  it("takes a counter above 2^32 by its high and low word", () => {
    // Worked out with Python's hmac and struct.pack(">Q", counter)
    expect(hotp(seed20, 2 ** 32 + 5, 6, "SHA1")).toBe("250721");
    expect(hotp(seed20, 2 ** 53 - 1, 7, "SHA1")).toBe("1891307");
  });

  it("refuses digits other than 6 to 8 and counters that are no whole number from 0", () => {
    for (const digits of [5, 9, 6.5])
      expect(() => hotp(seed20, 0, digits, "SHA1")).toThrow(
        new RangeError("digits must be 6, 7 or 8"),
      );
    for (const counter of [-1, 1.5, Number.NaN, 2 ** 53])
      expect(() => hotp(seed20, counter, 6, "SHA1")).toThrow(
        new RangeError("counter must be a whole number from 0 to 2^53 - 1"),
      );
  });
});

describe("totp (RFC 6238)", () => {
  const vectors: [number, string, string, string][] = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];

  it("gives the codes of Appendix B for SHA-1, SHA-256 and SHA-512", () => {
    for (const [time, sha1, sha256, sha512] of vectors) {
      const at = (key: Uint8Array, algorithm: (typeof OTP_ALGORITHMS)[number]) =>
        totp(key, time, { digits: 8, period: 30, algorithm }).code;
      expect([at(seed20, "SHA1"), at(seed32, "SHA256"), at(seed64, "SHA512")]).toEqual([
        sha1,
        sha256,
        sha512,
      ]);
    }
    expect(OTP_ALGORITHMS).toEqual(["SHA1", "SHA256", "SHA512"]);
  });

  it("says how many seconds the code still holds", () => {
    const options = { digits: 6, period: 30, algorithm: "SHA1" } as const;
    expect(totp(seed20, 59, options).remaining).toBe(1);
    expect(totp(seed20, 60, options).remaining).toBe(30);
    expect(totp(seed20, 75.5, options).remaining).toBe(15);
    expect(totp(seed20, 75.5, options).code).toBe(totp(seed20, 60, options).code);
    expect(totp(seed20, 89, { ...options, period: 60 }).remaining).toBe(31);
  });

  it("refuses a period that is no whole number from 1 and a time before 1970", () => {
    for (const period of [0, -30, 1.5])
      expect(() => totp(seed20, 0, { digits: 6, period, algorithm: "SHA1" })).toThrow(
        new RangeError("period must be a whole number of seconds from 1"),
      );
    // One second is the shortest period: the counter is then the time itself
    expect(totp(seed20, 59, { digits: 8, period: 1, algorithm: "SHA1" })).toEqual({
      code: hotp(seed20, 59, 8, "SHA1"),
      remaining: 1,
    });
    expect(() => totp(seed20, -1, { digits: 6, period: 30, algorithm: "SHA1" })).toThrow(
      new RangeError("counter must be a whole number from 0 to 2^53 - 1"),
    );
  });
});
