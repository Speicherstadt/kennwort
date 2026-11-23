import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PWNED_PREFIX_LENGTH, pwnedHash } from "./pwned.ts";

const nodeSha1 = (password: string) =>
  createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();

// K-603: the SHA-1 of a password, split for the k-anonymity range query of Pwned Passwords
describe("pwnedHash", () => {
  it('splits SHA-1("password") into the five-character prefix and the rest (the API docs\' example)', () => {
    expect(pwnedHash("password")).toEqual({
      prefix: "5BAA6",
      suffix: "1E4C9B93F3F0682250B6CF8331B7EE68FD8",
    });
    expect(PWNED_PREFIX_LENGTH).toBe(5);
  });

  it('hashes "abc" and the empty password as FIPS 180-4 does', () => {
    const abc = pwnedHash("abc");
    expect(abc.prefix + abc.suffix).toBe("A9993E364706816ABA3E25717850C26C9CD0D89D");
    const empty = pwnedHash("");
    expect(empty.prefix + empty.suffix).toBe("DA39A3EE5E6B4B0D3255BFEF95601890AFD80709");
  });

  it("hashes the UTF-8 bytes as stored, without normalising: NFC and NFD differ", () => {
    const nfc = "Müller-Heizung";
    const hashed = pwnedHash(nfc);
    expect(hashed.prefix + hashed.suffix).toBe(nodeSha1(nfc));
    expect(pwnedHash(nfc.normalize("NFD"))).not.toEqual(hashed);
  });

  it("agrees with node:crypto, five plus 35 upper-case hex characters, for any password", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 40 }), (password) => {
        const { prefix, suffix } = pwnedHash(password);
        expect(prefix).toMatch(/^[0-9A-F]{5}$/);
        expect(suffix).toMatch(/^[0-9A-F]{35}$/);
        expect(prefix + suffix).toBe(nodeSha1(password));
      }),
    );
  });
});
