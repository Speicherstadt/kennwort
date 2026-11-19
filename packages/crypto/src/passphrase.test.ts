import { argon2id } from "@noble/hashes/argon2.js";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/passphrase-v1.json" with { type: "json" };
import { PASSPHRASE_V1, passphraseKeys, passphraseKeysWith } from "./passphrase.ts";
import { fromHex, hex } from "./test-helpers.ts";

// RFC 9106, section 5.3 (Argon2id with secret and associated data): the primitive, through @noble/hashes
describe("Argon2id RFC 9106 5.3", () => {
  it("derives the RFC's tag", () => {
    const tag = argon2id(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), {
      m: 32,
      t: 3,
      p: 4,
      dkLen: 32,
      key: new Uint8Array(8).fill(3),
      personalization: new Uint8Array(12).fill(4),
    });
    expect(hex(tag)).toBe("0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659");
  });
});

describe.each(vectors)("F-05 vector: $name (libsodium and node:crypto)", (vector) => {
  it("derives the same unlock and login keys", () => {
    const keys = passphraseKeys(
      vector.passphrase,
      fromHex(vector.accountSalt),
      fromHex(vector.secretKey),
      fromHex(vector.accountId),
    );
    expect(hex(keys.unlock)).toBe(vector.unlock);
    expect(hex(keys.login)).toBe(vector.login);
  });
});

describe("passphraseKeys", () => {
  // Small Argon2id parameters keep these tests fast; the vectors above use the real ones
  const quick = { m: 8, t: 1, p: 1 };
  const salt = new Uint8Array(16).fill(1);
  const secretKey = new Uint8Array(16).fill(2);
  const account = new Uint8Array(16).fill(3);
  const keys = (passphrase: string, s = salt, k = secretKey, a = account) =>
    passphraseKeysWith(quick, passphrase, s, k, a);

  it("uses Argon2id with 64 MiB, three passes and one lane, fixed in version 1", () => {
    expect(PASSPHRASE_V1).toEqual({ m: 65536, t: 3, p: 1 });
    expect(Object.isFrozen(PASSPHRASE_V1)).toBe(true);
  });

  it("derives two different keys for unlocking and for the login", () => {
    const { unlock, login } = keys("Passphrase");
    expect(unlock.length).toBe(32);
    expect(hex(unlock)).not.toBe(hex(login));
  });

  it("changes both keys with another passphrase, salt, Secret Key or account", () => {
    const base = hex(keys("Passphrase").unlock);
    expect(hex(keys("passphrase").unlock)).not.toBe(base);
    expect(hex(keys("Passphrase", new Uint8Array(16)).unlock)).not.toBe(base);
    expect(hex(keys("Passphrase", salt, new Uint8Array(16)).unlock)).not.toBe(base);
    expect(hex(keys("Passphrase", salt, secretKey, new Uint8Array(16)).unlock)).not.toBe(base);
    expect(hex(keys("Passphrase", salt, secretKey, new Uint8Array(16)).login)).not.toBe(
      hex(keys("Passphrase").login),
    );
  });

  it("reads the passphrase as NFKC, so composed and decomposed umlauts are the same", () => {
    expect(hex(keys("Bäckerei").unlock)).toBe(hex(keys("Bäckerei").unlock));
  });

  it("refuses a salt or Secret Key that is not 16 bytes", () => {
    expect(() => keys("x", new Uint8Array(15))).toThrow("account salt must be 16 bytes");
    expect(() => keys("x", salt, new Uint8Array(17))).toThrow("secret key must be 16 bytes");
  });
});
