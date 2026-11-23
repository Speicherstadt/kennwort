// K-707: what goes to Better Auth carries no client extension result, and options that are not
// well-formed start no ceremony
import { describe, expect, it } from "vitest";
import {
  creationOptions,
  credentialJson,
  type PublicKeyCredentialLike,
  prfOutput,
  requestOptions,
} from "./webauthn-json.ts";

const salt = new Uint8Array(32).fill(5);
const registration = {
  challenge: "Y2hhbGxlbmdl",
  rp: { id: "localhost", name: "Kennwort" },
  user: { id: "dXNlcg", name: "anna", displayName: "Anna" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }, { alg: "x" }],
  timeout: 60000,
  excludeCredentials: [{ id: "b2xk", type: "public-key" }, { id: "a+b" }],
  authenticatorSelection: { userVerification: "required" },
};

const credential = (first?: BufferSource): PublicKeyCredentialLike => ({
  rawId: new Uint8Array([1, 2, 3]).buffer,
  type: "public-key",
  authenticatorAttachment: "platform",
  response: {
    clientDataJSON: new Uint8Array([4]).buffer,
    attestationObject: new Uint8Array([5]).buffer,
    getTransports: () => ["internal"],
  },
  getClientExtensionResults: () => ({ prf: { enabled: true, results: first ? { first } : {} } }),
});

describe("WebAuthn as JSON (K-707)", () => {
  it("asks for PRF with this passkey's salt and keeps only well-formed parts", () => {
    const options = creationOptions(registration, salt)?.publicKey;
    expect(options?.extensions?.prf?.eval?.first).toBe(salt);
    expect(options?.pubKeyCredParams).toEqual([{ type: "public-key", alg: -7 }]);
    expect(options?.excludeCredentials).toHaveLength(1);
    expect(options?.authenticatorSelection?.userVerification).toBe("required");
    expect(options?.attestation).toBe("none");
    expect(options?.timeout).toBe(60000);
  });

  it("starts no ceremony with options that are not well-formed", () => {
    expect(creationOptions({ ...registration, challenge: "a+b" }, salt)).toBeUndefined();
    expect(creationOptions({ ...registration, rp: {} }, salt)).toBeUndefined();
    expect(creationOptions({ ...registration, pubKeyCredParams: [] }, salt)).toBeUndefined();
    expect(creationOptions(null, salt)).toBeUndefined();
    expect(requestOptions({}, new Uint8Array([1]), salt)).toBeUndefined();
    expect(requestOptions("x", new Uint8Array([1]), salt)).toBeUndefined();
  });

  it("asks exactly the remembered passkey", () => {
    const options = requestOptions(
      { challenge: "Y2hh", rpId: "localhost" },
      new Uint8Array([1]),
      salt,
    );
    expect(options?.publicKey?.allowCredentials).toEqual([
      { id: new Uint8Array([1]), type: "public-key" },
    ]);
    expect(options?.publicKey?.userVerification).toBe("preferred");
    expect(options?.publicKey?.extensions?.prf?.eval?.first).toBe(salt);
  });

  it("sends the credential without any client extension result", () => {
    const json = credentialJson(credential(new Uint8Array(32).fill(6)));
    expect(json).toEqual({
      id: "AQID",
      rawId: "AQID",
      type: "public-key",
      response: { clientDataJSON: "BA", attestationObject: "BQ", transports: ["internal"] },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    });
    expect(JSON.stringify(json)).not.toContain("prf");
  });

  it("takes a 32-byte PRF output and overwrites the browser's copy", () => {
    const browsers = new Uint8Array(32).fill(6);
    expect(prfOutput(credential(browsers))).toEqual(new Uint8Array(32).fill(6));
    expect(browsers).toEqual(new Uint8Array(32));
    expect(prfOutput(credential(new Uint8Array(16).fill(1)))).toBeUndefined();
    expect(prfOutput(credential())).toBeUndefined();
  });
});
