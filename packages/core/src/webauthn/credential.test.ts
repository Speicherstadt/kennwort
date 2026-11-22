import { createPublicKey, verify } from "node:crypto";
import { newPasskeyKey, passkeyPublicKey } from "@kennwort/crypto";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import { bytes } from "../sync/bytes.ts";
import { ASSERTION_FLAGS, coseKey, signedMessage } from "./authenticator.ts";
import { assertion, PASSKEY_COUNTER, registration, TRANSPORTS } from "./credential.ts";

// K-406: what Kennwort's prompt answers a relying party, checked by SimpleWebAuthn's server
// (MasterKale/SimpleWebAuthn, packages/server) exactly as a relying party checks any authenticator
const ORIGIN = "https://portal.weber-haustechnik.test";
const RP = "weber-haustechnik.test";
const challenge = Uint8Array.from({ length: 32 }, (_, i) => i * 7);
const credentialId = Uint8Array.from({ length: 16 }, (_, i) => 200 - i);
const userHandle = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64url");
const decode = (text: string) => bytes().parse(text);

const value = <T>(result: { ok: true; value: T } | { ok: false; error: string }) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const publicOf = (key: Uint8Array) => value(passkeyPublicKey(key));

describe("registration", () => {
  it("passes SimpleWebAuthn's verification with attestation none, user verified and synced", async () => {
    const key = newPasskeyKey();
    const json = value(registration({ origin: ORIGIN, rpId: RP, challenge }, credentialId, key));
    const verified = await verifyRegistrationResponse({
      response: json,
      expectedChallenge: b64(challenge),
      expectedOrigin: ORIGIN,
      expectedRPID: RP,
      requireUserVerification: true,
    });
    expect(verified.verified).toBe(true);
    const info = verified.registrationInfo;
    expect(info?.fmt).toBe("none");
    expect(info?.aaguid).toBe("00000000-0000-0000-0000-000000000000");
    expect(info?.credential.id).toBe(b64(credentialId));
    expect(info?.credential.counter).toBe(0);
    expect(info?.credentialDeviceType).toBe("multiDevice");
    expect(info?.credentialBackedUp).toBe(true);
    expect(info?.userVerified).toBe(true);
    expect(info?.credential.publicKey).toEqual(coseKey(publicOf(key)));
  });

  it("carries the fields of RegistrationResponseJSON (WebAuthn Level 3, §5.2.1)", () => {
    const key = newPasskeyKey();
    const json = value(registration({ origin: ORIGIN, rpId: RP, challenge }, credentialId, key));
    expect(json).toMatchObject({
      id: b64(credentialId),
      rawId: b64(credentialId),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
    });
    expect(json.response.publicKeyAlgorithm).toBe(-7);
    expect(json.response.transports).toEqual(["hybrid", "internal"]);
    expect(TRANSPORTS).toEqual(["hybrid", "internal"]);
    expect(json.response.transports).not.toBe(TRANSPORTS);
    const spki = createPublicKey({
      key: Buffer.from(decode(json.response.publicKey)),
      format: "der",
      type: "spki",
    });
    expect(spki.asymmetricKeyType).toBe("ec");
    expect(new TextDecoder().decode(decode(json.response.clientDataJSON))).toBe(
      `{"type":"webauthn.create","challenge":"${b64(challenge)}","origin":"${ORIGIN}","crossOrigin":false}`,
    );
    expect(decode(json.response.authenticatorData)[32]).toBe(0x5d);
  });

  it("is refused for another origin, rpId or challenge", async () => {
    const json = value(
      registration({ origin: ORIGIN, rpId: RP, challenge }, credentialId, newPasskeyKey()),
    );
    const check = (expected: { origin?: string; rpId?: string; challenge?: string }) =>
      verifyRegistrationResponse({
        response: json,
        expectedChallenge: expected.challenge ?? b64(challenge),
        expectedOrigin: expected.origin ?? ORIGIN,
        expectedRPID: expected.rpId ?? RP,
      });
    await expect(check({ origin: "https://portal-weber-haustechnik.test" })).rejects.toThrow();
    await expect(check({ rpId: "portal.weber-haustechnik.test" })).rejects.toThrow();
    await expect(check({ challenge: b64(new Uint8Array(32)) })).rejects.toThrow();
  });

  it("refuses a key that is not F-12 v1", () => {
    expect(
      registration({ origin: ORIGIN, rpId: RP, challenge }, credentialId, new Uint8Array(33)),
    ).toEqual({
      ok: false,
      error: "unknown-version",
    });
  });
});

describe("assertion", () => {
  it("passes SimpleWebAuthn's verification against the registered key, counter 0", async () => {
    const key = newPasskeyKey();
    const json = value(
      assertion({ origin: ORIGIN, rpId: RP, challenge }, credentialId, userHandle, key),
    );
    const verified = await verifyAuthenticationResponse({
      response: json,
      expectedChallenge: b64(challenge),
      expectedOrigin: ORIGIN,
      expectedRPID: RP,
      credential: {
        id: b64(credentialId),
        publicKey: new Uint8Array(coseKey(publicOf(key))),
        counter: 0,
      },
      requireUserVerification: true,
    });
    expect(verified.verified).toBe(true);
    expect(verified.authenticationInfo.newCounter).toBe(0);
    expect(verified.authenticationInfo.userVerified).toBe(true);
    expect(verified.authenticationInfo.credentialBackedUp).toBe(true);
    expect(PASSKEY_COUNTER).toBe(0);
    expect(json).toMatchObject({
      id: b64(credentialId),
      rawId: b64(credentialId),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { userHandle: b64(userHandle) },
    });
  });

  it("signs authData ‖ SHA-256(clientDataJSON) with DER ES256", () => {
    const key = newPasskeyKey();
    const json = value(
      assertion({ origin: ORIGIN, rpId: RP, challenge }, credentialId, userHandle, key),
    );
    const authData = decode(json.response.authenticatorData);
    expect(authData.length).toBe(37);
    expect(authData[32]).toBe(ASSERTION_FLAGS);
    const spki = Buffer.concat([
      Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
      Buffer.from(publicOf(key)),
    ]);
    const message = signedMessage(authData, decode(json.response.clientDataJSON));
    expect(
      verify(
        "sha256",
        message,
        createPublicKey({ key: spki, format: "der", type: "spki" }),
        decode(json.response.signature),
      ),
    ).toBe(true);
    expect(new TextDecoder().decode(decode(json.response.clientDataJSON))).toContain(
      '"type":"webauthn.get"',
    );
  });

  it("is refused under another key or origin", async () => {
    const json = value(
      assertion({ origin: ORIGIN, rpId: RP, challenge }, credentialId, userHandle, newPasskeyKey()),
    );
    await expect(
      verifyAuthenticationResponse({
        response: json,
        expectedChallenge: b64(challenge),
        expectedOrigin: ORIGIN,
        expectedRPID: RP,
        credential: {
          id: b64(credentialId),
          publicKey: new Uint8Array(coseKey(publicOf(newPasskeyKey()))),
          counter: 0,
        },
      }),
    ).resolves.toMatchObject({ verified: false });
  });

  it("refuses a key that is not F-12 v1", () => {
    expect(
      assertion(
        { origin: ORIGIN, rpId: RP, challenge },
        credentialId,
        userHandle,
        Uint8Array.of(2),
      ),
    ).toEqual({
      ok: false,
      error: "unknown-version",
    });
  });
});
