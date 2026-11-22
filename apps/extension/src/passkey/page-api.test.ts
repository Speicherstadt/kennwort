import { describe, expect, it, vi } from "vitest";
import type { PasskeyAnswer } from "./messages.ts";
import { type Ask, installPasskeys } from "./page-api.ts";

// K-406: the page's navigator.credentials hands publicKey ceremonies to Kennwort and turns the
// answer into a PublicKeyCredential; everything else, and every fallback, is the browser's own
const bytes = (...values: number[]) => Uint8Array.from(values);
const creation = {
  rp: { id: "weber-haustechnik.test", name: "Weber Portal" },
  user: { id: bytes(1, 2, 3), name: "jonas.weber", displayName: "Jonas Weber" },
  challenge: bytes(0xab, 0xcd, 0xef).buffer,
  pubKeyCredParams: [
    { type: "public-key", alg: -7 },
    { type: "other", alg: -8 },
  ],
  excludeCredentials: [{ type: "public-key", id: bytes(0, 1, 2) }],
  authenticatorSelection: { userVerification: "required" },
  timeout: 60_000,
} as unknown as PublicKeyCredentialCreationOptions;
const request = {
  rpId: "weber-haustechnik.test",
  challenge: new DataView(bytes(9, 0xab, 0xcd, 0xef, 9).buffer, 1, 3),
  allowCredentials: [{ type: "public-key", id: bytes(0, 1, 2) }],
} as unknown as PublicKeyCredentialRequestOptions;

const registration = {
  id: "AAEC",
  rawId: "AAEC",
  type: "public-key" as const,
  authenticatorAttachment: "platform" as const,
  clientExtensionResults: {},
  response: {
    clientDataJSON: "e30",
    attestationObject: "oA",
    authenticatorData: "AQI",
    publicKey: "AwQ",
    publicKeyAlgorithm: -7,
    transports: ["hybrid", "internal"],
  },
};
const assertion = {
  ...registration,
  response: {
    clientDataJSON: "e30",
    authenticatorData: "AQI",
    signature: "MEU",
    userHandle: "AQID",
  },
};

class FakeCredential {}
class FakeAttestation {}
class FakeAssertion {}
const world = {
  PublicKeyCredential: FakeCredential,
  AuthenticatorAttestationResponse: FakeAttestation,
  AuthenticatorAssertionResponse: FakeAssertion,
};

const setup = (answer: PasskeyAnswer | undefined | Promise<PasskeyAnswer | undefined>) => {
  const browserCredential = { id: "from-the-browser" } as unknown as Credential;
  const create = vi.fn(async function (this: unknown, _options?: CredentialCreationOptions) {
    return browserCredential;
  });
  const get = vi.fn(async function (this: unknown, _options?: CredentialRequestOptions) {
    return browserCredential;
  });
  const container = { create, get } as unknown as CredentialsContainer;
  const ask = vi.fn<Ask>(async () => answer);
  installPasskeys(container, ask, world);
  return { container, ask, create, get, browserCredential };
};

const text = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)];

describe("installPasskeys", () => {
  it("hands a registration to Kennwort and returns its credential as a PublicKeyCredential", async () => {
    const { container, ask, create } = setup({ outcome: "credential", credential: registration });
    const credential = (await container.create({ publicKey: creation })) as unknown as Record<
      string,
      unknown
    > & {
      response: Record<string, unknown> & {
        getTransports(): string[];
        getPublicKeyAlgorithm(): number;
        getPublicKey(): ArrayBuffer;
        getAuthenticatorData(): ArrayBuffer;
      };
      rawId: ArrayBuffer;
      toJSON(): unknown;
      getClientExtensionResults(): unknown;
    };
    expect(ask).toHaveBeenCalledWith(
      {
        type: "passkey-create",
        options: {
          rp: { id: "weber-haustechnik.test", name: "Weber Portal" },
          user: { id: "AQID", name: "jonas.weber", displayName: "Jonas Weber" },
          challenge: "q83v",
          algorithms: [-7],
          exclude: ["AAEC"],
          userVerification: "required",
          timeout: 60_000,
        },
      },
      undefined,
    );
    expect(create).not.toHaveBeenCalled();
    expect(credential).toBeInstanceOf(FakeCredential);
    expect(credential.response).toBeInstanceOf(FakeAttestation);
    expect(credential.id).toBe("AAEC");
    expect(credential.type).toBe("public-key");
    expect(credential.authenticatorAttachment).toBe("platform");
    expect(text(credential.rawId)).toEqual([0, 1, 2]);
    expect(text(credential.response.clientDataJSON as ArrayBuffer)).toEqual([0x7b, 0x7d]);
    expect(text(credential.response.attestationObject as ArrayBuffer)).toEqual([0xa0]);
    expect(text(credential.response.getAuthenticatorData())).toEqual([1, 2]);
    expect(text(credential.response.getPublicKey())).toEqual([3, 4]);
    expect(credential.response.getPublicKeyAlgorithm()).toBe(-7);
    expect(credential.response.getTransports()).toEqual(["hybrid", "internal"]);
    expect(credential.getClientExtensionResults()).toEqual({});
    expect(credential.toJSON()).toEqual(registration);
    expect(credential.toJSON()).not.toBe(registration);
  });

  it("hands a sign-in to Kennwort and returns its assertion", async () => {
    const { container, ask } = setup({ outcome: "credential", credential: assertion });
    const signal = new AbortController().signal;
    const credential = (await container.get({ publicKey: request, signal })) as unknown as {
      response: { userHandle: ArrayBuffer; signature: ArrayBuffer; authenticatorData: ArrayBuffer };
    };
    expect(ask).toHaveBeenCalledWith(
      {
        type: "passkey-get",
        options: {
          rpId: "weber-haustechnik.test",
          challenge: "q83v",
          allow: ["AAEC"],
          userVerification: "preferred",
        },
      },
      signal,
    );
    expect(credential.response).toBeInstanceOf(FakeAssertion);
    expect(text(credential.response.userHandle)).toEqual([1, 2, 3]);
    expect(text(credential.response.signature)).toEqual([0x30, 0x45]);
    expect(text(credential.response.authenticatorData)).toEqual([1, 2]);
  });

  it("calls the browser's own function, on the container, for a fallback or no answer", async () => {
    for (const answer of [{ outcome: "fallback" } as const, undefined]) {
      const { container, create, get, browserCredential } = setup(answer);
      const options = { publicKey: creation };
      expect(await container.create(options)).toBe(browserCredential);
      expect(create).toHaveBeenCalledWith(options);
      expect(create.mock.contexts[0]).toBe(container);
      expect(await container.get({ publicKey: request })).toBe(browserCredential);
      expect(get.mock.contexts[0]).toBe(container);
    }
  });

  it("leaves other credentials, conditional mediation and broken options to the browser", async () => {
    const { container, ask, create, get } = setup({ outcome: "fallback" });
    await container.get({ password: true } as CredentialRequestOptions);
    await container.get();
    await container.get({ publicKey: request, mediation: "conditional" });
    await container.create({
      publicKey: { ...creation, user: undefined } as unknown as PublicKeyCredentialCreationOptions,
    });
    expect(ask).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("ends with the error Kennwort answers", async () => {
    for (const name of ["NotAllowedError", "SecurityError"] as const) {
      const { container } = setup({ outcome: "error", name });
      await expect(container.create({ publicKey: creation })).rejects.toMatchObject({ name });
    }
  });

  it("ends at once with the page's abort", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const { container, ask } = setup({ outcome: "fallback" });
    await expect(
      container.get({ publicKey: request, signal: aborted.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(ask).not.toHaveBeenCalled();

    const later = new AbortController();
    const waiting = setup(new Promise<PasskeyAnswer>(() => {}));
    const call = waiting.container.get({ publicKey: request, signal: later.signal });
    later.abort(new DOMException("stop", "AbortError"));
    await expect(call).rejects.toMatchObject({ name: "AbortError", message: "stop" });
  });

  it("keeps the credential without prototypes where the browser has none", async () => {
    const container = { create: vi.fn(), get: vi.fn() } as unknown as CredentialsContainer;
    installPasskeys(container, async () => ({ outcome: "credential", credential: assertion }), {});
    const credential = await container.get({ publicKey: request });
    expect(Object.getPrototypeOf(credential)).toBe(Object.prototype);
  });
});
