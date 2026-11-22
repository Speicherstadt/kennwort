import { argon2id } from "@noble/hashes/argon2.js";
import { describe, expect, it } from "vitest";
import vectors from "../vectors/password-alert-v1.json" with { type: "json" };
import {
  ALERT_HOST_TAG_LENGTH,
  ALERT_SALT_LENGTH,
  ALERT_TAG_LENGTH,
  alertHostTag,
  alertTag,
  PASSWORD_ALERT_V1,
} from "./password-alert.ts";
import { fromHex, hex } from "./test-helpers.ts";

// F-10: the short, salted, slow hashes of the phishing warning (K-405)
describe.each(vectors)("F-10 vector: $name (node:crypto)", (vector) => {
  it("derives the same tag and host tag", () => {
    const salt = fromHex(vector.salt);
    expect(hex(alertTag(vector.password, salt))).toBe(vector.tag);
    expect(hex(alertHostTag(vector.host, salt))).toBe(vector.hostTag);
  });
});

describe("alertTag", () => {
  const salt = new Uint8Array(16).fill(9);

  it("is Argon2id with 1 MiB, two passes and one lane, four bytes, fixed in version 1", () => {
    expect(PASSWORD_ALERT_V1).toEqual({ m: 1024, t: 2, p: 1 });
    expect(Object.isFrozen(PASSWORD_ALERT_V1)).toBe(true);
    expect([ALERT_SALT_LENGTH, ALERT_TAG_LENGTH, ALERT_HOST_TAG_LENGTH]).toEqual([16, 4, 16]);
    expect(alertTag("Kupfer-Rohr-18!", salt)).toEqual(
      argon2id(new TextEncoder().encode("Kupfer-Rohr-18!"), salt, {
        m: 1024,
        t: 2,
        p: 1,
        dkLen: 4,
      }),
    );
  });

  it("takes the password as typed: another salt, case or normal form is another tag", () => {
    const base = hex(alertTag("Bäcker", salt));
    expect(hex(alertTag("Bäcker", salt))).toBe(base);
    expect(hex(alertTag("bäcker", salt))).not.toBe(base);
    expect(hex(alertTag("Bäcker".normalize("NFD"), salt))).not.toBe(base);
    expect(hex(alertTag("Bäcker", new Uint8Array(16)))).not.toBe(base);
  });

  it("refuses a salt that is not 16 bytes", () => {
    expect(() => alertTag("x", new Uint8Array(15))).toThrow(RangeError);
    expect(() => alertTag("x", new Uint8Array(17))).toThrow("alert salt must be 16 bytes");
  });
});

describe("alertHostTag", () => {
  const salt = new Uint8Array(16).fill(3);

  it("is 16 bytes and differs by host and by salt", () => {
    const base = alertHostTag("portal.weber-haustechnik.test", salt);
    expect(base.length).toBe(16);
    expect(hex(alertHostTag("portal-weber-haustechnik.test", salt))).not.toBe(hex(base));
    expect(hex(alertHostTag("portal.weber-haustechnik.test", new Uint8Array(16)))).not.toBe(
      hex(base),
    );
  });

  it("refuses a salt that is not 16 bytes", () => {
    expect(() => alertHostTag("bank.test", new Uint8Array(8))).toThrow(
      "alert salt must be 16 bytes",
    );
  });
});
