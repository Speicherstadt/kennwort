import { sha256 } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  AAGUID,
  ASSERTION_FLAGS,
  attestationObject,
  authenticatorData,
  clientDataJSON,
  coseKey,
  FLAGS,
  REGISTRATION_FLAGS,
  signedMessage,
  spkiKey,
} from "./authenticator.ts";

// WebAuthn Level 3, §6.1, §6.5 and §5.8.1.1, written by hand for the passkeys of K-406
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const utf8 = (text: string) => new TextEncoder().encode(text);
// The public key of d = 1, the base point G of P-256 (passkey-v1.json)
const X = "6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296";
const Y = "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5";
const POINT = Uint8Array.from(Buffer.from(`04${X}${Y}`, "hex"));
const RP = "weber-haustechnik.test";

describe("flags", () => {
  it("are user present, verified, backup eligible and backed up; attested on a registration", () => {
    expect(FLAGS).toEqual({ up: 1, uv: 4, be: 8, bs: 16, at: 64 });
    expect(ASSERTION_FLAGS).toBe(0b0001_1101);
    expect(REGISTRATION_FLAGS).toBe(0b0101_1101);
  });

  it("names no authenticator: the AAGUID is 16 zero bytes", () => {
    expect(hex(AAGUID)).toBe("00".repeat(16));
  });
});

describe("coseKey and spkiKey", () => {
  it("writes the EC2 key of ES256 on P-256 in canonical order", () => {
    expect(hex(coseKey(POINT))).toBe(`a5010203262001215820${X}225820${Y}`);
  });

  it("writes the SubjectPublicKeyInfo of RFC 5480", () => {
    expect(hex(spkiKey(POINT))).toBe(
      `3059301306072a8648ce3d020106082a8648ce3d030107034200${hex(POINT)}`,
    );
  });

  it("refuses anything but an uncompressed point", () => {
    for (const bad of [
      POINT.slice(1),
      Uint8Array.of(...POINT, 0),
      Uint8Array.of(3, ...POINT.slice(1)),
    ]) {
      expect(() => coseKey(bad)).toThrow("expected an uncompressed P-256 point");
      expect(() => spkiKey(bad)).toThrow(RangeError);
    }
  });
});

describe("authenticatorData", () => {
  it("is SHA-256 of the rpId, the flags and the counter, big endian, for an assertion", () => {
    const data = authenticatorData(RP, ASSERTION_FLAGS, 0x01020304);
    expect(hex(data)).toBe(`${hex(sha256(utf8(RP)))}1d01020304`);
    expect(hex(authenticatorData(RP, 1, 0xffff_ffff).slice(32))).toBe("01ffffffff");
  });

  it("adds AAGUID, the length of the credential ID, the ID and the COSE key for a registration", () => {
    const credentialId = Uint8Array.from({ length: 16 }, (_, i) => i);
    const data = authenticatorData(RP, REGISTRATION_FLAGS, 0, { credentialId, publicKey: POINT });
    expect(hex(data)).toBe(
      `${hex(sha256(utf8(RP)))}5d00000000${"00".repeat(16)}0010${hex(credentialId)}${hex(coseKey(POINT))}`,
    );
    const long = new Uint8Array(1023).fill(7);
    const withLong = authenticatorData(RP, REGISTRATION_FLAGS, 0, {
      credentialId: long,
      publicKey: POINT,
    });
    expect(hex(withLong.slice(53, 55))).toBe("03ff");
  });

  it("refuses a counter or a credential ID out of range", () => {
    expect(() => authenticatorData(RP, 1, -1)).toThrow("counter out of range");
    expect(() => authenticatorData(RP, 1, 0x1_0000_0000)).toThrow(RangeError);
    expect(() => authenticatorData(RP, 1, 0.5)).toThrow(RangeError);
    for (const credentialId of [new Uint8Array(0), new Uint8Array(1024)])
      expect(() => authenticatorData(RP, 1, 0, { credentialId, publicKey: POINT })).toThrow(
        "credential ID length out of range",
      );
  });
});

describe("attestationObject", () => {
  it("is fmt none, an empty statement and the authenticator data, in canonical order", () => {
    expect(hex(attestationObject(Uint8Array.of(9, 8)))).toBe(
      "a363666d74646e6f6e656761747453746d74a0686175746844617461420908",
    );
  });
});

describe("clientDataJSON", () => {
  it("is the browser's JSON: type, challenge, origin and crossOrigin false", () => {
    const json = clientDataJSON({
      type: "webauthn.get",
      challenge: "q83v",
      origin: `https://portal.${RP}`,
    });
    expect(new TextDecoder().decode(json)).toBe(
      `{"type":"webauthn.get","challenge":"q83v","origin":"https://portal.${RP}","crossOrigin":false}`,
    );
  });
});

describe("signedMessage", () => {
  it("is the authenticator data followed by SHA-256 of the client data", () => {
    const client = utf8("{}");
    expect(hex(signedMessage(Uint8Array.of(1, 2), client))).toBe(`0102${hex(sha256(client))}`);
  });
});
