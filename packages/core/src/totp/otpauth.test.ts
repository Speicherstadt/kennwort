import { describe, expect, it } from "vitest";
import { base32Decode, parseTotp, totpCode } from "./otpauth.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const ok = <T>(result: { ok: true; value: T } | { ok: false; error: string }) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("base32Decode (RFC 4648, section 10)", () => {
  it("decodes the RFC's examples, with and without padding, any case and spaces", () => {
    const cases: [string, string][] = [
      ["", ""],
      ["MY======", "f"],
      ["MZXQ====", "fo"],
      ["MZXW6===", "foo"],
      ["MZXW6YQ=", "foob"],
      ["MZXW6YTB", "fooba"],
      ["MZXW6YTBOI======", "foobar"],
    ];
    for (const [encoded, plain] of cases) {
      expect(text(ok(base32Decode(encoded)))).toBe(plain);
      expect(text(ok(base32Decode(encoded.replaceAll("=", "").toLowerCase())))).toBe(plain);
    }
    expect(text(ok(base32Decode("mzxw 6ytb oi")))).toBe("foobar");
    // A is the value 0, not a letter outside the alphabet
    expect(ok(base32Decode("AE"))).toEqual(new Uint8Array([1]));
  });

  it("refuses letters outside the alphabet and lengths no bytes end on", () => {
    // Padding only at the end: "=" inside is no letter of the alphabet
    for (const bad of ["MZXW1", "MZXW6YTB0I", "M", "MZX", "MZXW6Y", "MY=a", "MZ-XW", "MZ=XW6YTB"])
      expect(base32Decode(bad)).toEqual({ ok: false, error: "bad-secret" });
  });
});

describe("parseTotp", () => {
  it("reads an otpauth link with every parameter (Key URI format)", () => {
    expect(
      ok(
        parseTotp(
          "otpauth://totp/Sparkasse:weber%40haustechnik.de?secret=JBSWY3DPEHPK3PXP&issuer=Sparkasse&algorithm=SHA256&digits=8&period=60",
        ),
      ),
    ).toEqual({
      secret: ok(base32Decode("JBSWY3DPEHPK3PXP")),
      issuer: "Sparkasse",
      account: "weber@haustechnik.de",
      algorithm: "SHA256",
      digits: 8,
      period: 60,
    });
  });

  it("takes defaults: SHA-1, six digits, 30 seconds; the issuer from the label if not given", () => {
    expect(
      ok(parseTotp("otpauth://totp/DATEV%20Unternehmen%3A%20jonas?secret=jbswy3dpehpk3pxp")),
    ).toEqual({
      secret: ok(base32Decode("JBSWY3DPEHPK3PXP")),
      issuer: "DATEV Unternehmen",
      account: "jonas",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    expect(
      ok(parseTotp("otpauth://totp/jonas?secret=JBSWY3DPEHPK3PXP&algorithm=sha512")),
    ).toMatchObject({ issuer: "", account: "jonas", algorithm: "SHA512" });
    expect(ok(parseTotp("OTPAUTH://TOTP/x?secret=JBSWY3DPEHPK3PXP")).account).toBe("x");
    // The issuer parameter wins over the label's; spaces around a pasted link go
    expect(
      ok(parseTotp(" otpauth://totp/Alt:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Neu ")),
    ).toMatchObject({
      issuer: "Neu",
      account: "jonas",
    });
    // Spaces around the parts of the label go; a label that starts with ":" has no issuer
    expect(
      ok(parseTotp("otpauth://totp/Bank%20%3A%20jonas?secret=JBSWY3DPEHPK3PXP")),
    ).toMatchObject({
      issuer: "Bank",
      account: "jonas",
    });
    expect(ok(parseTotp("otpauth://totp/%20jonas%20?secret=JBSWY3DPEHPK3PXP")).account).toBe(
      "jonas",
    );
    expect(ok(parseTotp("otpauth://totp/:jonas?secret=JBSWY3DPEHPK3PXP"))).toMatchObject({
      issuer: "",
      account: "jonas",
    });
    expect(
      ok(parseTotp("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=86400&digits=7")),
    ).toMatchObject({
      period: 86400,
      digits: 7,
    });
    expect(ok(parseTotp("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=1")).period).toBe(1);
  });

  it("reads a bare key as typed from a setup page, with the defaults", () => {
    expect(ok(parseTotp("  jbsw y3dp ehpk 3pxp "))).toEqual({
      secret: ok(base32Decode("JBSWY3DPEHPK3PXP")),
      issuer: "",
      account: "",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
  });

  it("refuses what it cannot make codes from", () => {
    const refused: [string, string][] = [
      ["", "bad-secret"],
      ["otpauth://totp/x", "bad-secret"],
      ["otpauth://totp/x?secret=", "bad-secret"],
      ["otpauth://totp/x?secret=MZXW1", "bad-secret"],
      ["otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1", "unsupported"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5", "unsupported"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=5", "unsupported"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=9", "unsupported"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=6.5", "unsupported"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=0", "unsupported"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=abc", "unsupported"],
      // A period longer than a day is no one-time code any more
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=86401", "unsupported"],
      ["https://example.com/?secret=JBSWY3DPEHPK3PXP", "bad-secret"],
      // No "//": the kind is no host, so it is no TOTP link
      ["otpauth:totp?secret=JBSWY3DPEHPK3PXP", "unsupported"],
      ["otpauth://to tp/x?secret=JBSWY3DPEHPK3PXP", "bad-secret"],
      ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=", "unsupported"],
      ["otpauth://totp/%E0%A4%A?secret=JBSWY3DPEHPK3PXP", "bad-secret"],
    ];
    for (const [value, error] of refused) expect(parseTotp(value)).toEqual({ ok: false, error });
  });
});

describe("totpCode", () => {
  it("gives the code of a stored value at a time, with the seconds left", () => {
    // RFC 6238 Appendix B: 20 ASCII digits are GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ in Base32
    const value = "otpauth://totp/RFC?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8";
    expect(totpCode(value, 59_000)).toEqual({
      ok: true,
      value: { code: "94287082", remaining: 1 },
    });
    expect(totpCode(value, 1_111_111_109_500)).toEqual({
      ok: true,
      value: { code: "07081804", remaining: 1 },
    });
    expect(totpCode("kein schlüssel", 0)).toEqual({ ok: false, error: "bad-secret" });
  });
});
