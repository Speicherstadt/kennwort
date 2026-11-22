import { describe, expect, it } from "vitest";
import {
  ceremonyOf,
  MAX_TIMEOUT_MS,
  pageRequest,
  passkeyAnswer,
  passkeyOpenMessage,
} from "./messages.ts";

// K-406: everything a page sends is checked for the shapes and sizes WebAuthn allows
const createOptions = {
  rp: { id: "weber-haustechnik.test", name: "Weber Portal" },
  user: { id: "AQID", name: "jonas.weber", displayName: "Jonas Weber" },
  challenge: "q83vEjRWeJA",
  algorithms: [-7, -257],
  exclude: ["AAEC"],
  userVerification: "required",
  timeout: 60_000,
};
const getOptions = {
  rpId: "weber-haustechnik.test",
  challenge: "q83vEjRWeJA",
  allow: [],
  userVerification: "discouraged",
};

describe("pageRequest", () => {
  it("takes a registration and a sign-in of the page's shape", () => {
    expect(pageRequest({ type: "passkey-create", options: createOptions })).toEqual({
      type: "passkey-create",
      options: createOptions,
    });
    expect(pageRequest({ type: "passkey-get", options: getOptions })).toEqual({
      type: "passkey-get",
      options: getOptions,
    });
  });

  it("drops what the page may leave out or set wrong, and caps the timeout", () => {
    const { id: _, ...rp } = createOptions.rp;
    expect(
      pageRequest({
        type: "passkey-create",
        options: {
          ...createOptions,
          rp: { ...rp, id: "" },
          userVerification: "always",
          timeout: 10 ** 9,
        },
      }),
    ).toEqual({
      type: "passkey-create",
      options: { ...createOptions, rp, userVerification: "preferred", timeout: MAX_TIMEOUT_MS },
    });
    expect(
      pageRequest({
        type: "passkey-get",
        options: { challenge: "AA", allow: [], rpId: "", timeout: -1, extra: 1 },
      }),
    ).toEqual({
      type: "passkey-get",
      options: { challenge: "AA", allow: [], userVerification: "preferred" },
    });
    expect(
      pageRequest({
        type: "passkey-get",
        options: { challenge: "AA", allow: [], timeout: Number.NaN },
      }),
    ).toEqual({
      type: "passkey-get",
      options: { challenge: "AA", allow: [], userVerification: "preferred" },
    });
  });

  it("refuses anything else", () => {
    const bad = (options: Record<string, unknown>) =>
      pageRequest({ type: "passkey-create", options: { ...createOptions, ...options } });
    for (const options of [
      { rp: null },
      { rp: { name: 1 } },
      { rp: { name: "x", id: 3 } },
      { rp: { name: "x".repeat(257) } },
      { user: null },
      { user: { ...createOptions.user, id: "A".repeat(87) } },
      { user: { ...createOptions.user, id: "" } },
      { user: { ...createOptions.user, id: "a+b" } },
      { user: { ...createOptions.user, name: 1 } },
      { user: { ...createOptions.user, displayName: undefined } },
      { challenge: "" },
      { challenge: "x".repeat(1401) },
      { algorithms: ["-7"] },
      { algorithms: [1.5] },
      { algorithms: "x" },
      { exclude: Array(65).fill("AA") },
      { exclude: [""] },
    ])
      expect(bad(options), JSON.stringify(options)).toBeUndefined();
    expect(
      pageRequest({ type: "passkey-get", options: { ...getOptions, rpId: 7 } }),
    ).toBeUndefined();
    expect(
      pageRequest({ type: "passkey-get", options: { ...getOptions, challenge: undefined } }),
    ).toBeUndefined();
    expect(
      pageRequest({ type: "passkey-get", options: { ...getOptions, allow: undefined } }),
    ).toBeUndefined();
    expect(pageRequest({ type: "passkey-get" })).toBeUndefined();
    expect(pageRequest({ type: "passkey-other", options: getOptions })).toBeUndefined();
    expect(pageRequest(null)).toBeUndefined();
    expect(pageRequest("passkey-get")).toBeUndefined();
  });
});

describe("passkeyAnswer", () => {
  const registration = {
    id: "AAEC",
    rawId: "AAEC",
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "e30",
      attestationObject: "oA",
      authenticatorData: "AA",
      publicKey: "AA",
      publicKeyAlgorithm: -7,
      transports: ["hybrid", "internal"],
    },
  };
  const assertion = {
    ...registration,
    response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "MEU", userHandle: "" },
  };

  it("takes a credential, the browser's own WebAuthn or a known error", () => {
    expect(passkeyAnswer({ outcome: "credential", credential: registration })).toEqual({
      outcome: "credential",
      credential: registration,
    });
    expect(passkeyAnswer({ outcome: "credential", credential: assertion })).toEqual({
      outcome: "credential",
      credential: assertion,
    });
    expect(passkeyAnswer({ outcome: "fallback", extra: 1 })).toEqual({ outcome: "fallback" });
    for (const name of ["NotAllowedError", "SecurityError"])
      expect(passkeyAnswer({ outcome: "error", name })).toEqual({ outcome: "error", name });
  });

  it("refuses anything else", () => {
    const credential = (change: Record<string, unknown>) => ({
      outcome: "credential",
      credential: { ...registration, ...change },
    });
    for (const answer of [
      null,
      { outcome: "error", name: "TypeError" },
      { outcome: "error", name: "InvalidStateError" },
      { outcome: "done" },
      credential({ id: "" }),
      credential({ rawId: "AAED" }),
      credential({ type: "password" }),
      credential({ authenticatorAttachment: "cross-platform" }),
      credential({ response: { ...registration.response, publicKeyAlgorithm: "-7" } }),
      credential({ response: { ...registration.response, transports: [1] } }),
      credential({ response: { ...assertion.response, signature: undefined } }),
      credential({ response: { ...assertion.response, signature: "x".repeat(8193) } }),
      credential({ response: null }),
      { outcome: "credential", credential: null },
    ])
      expect(passkeyAnswer(answer), JSON.stringify(answer)).toBeUndefined();
  });
});

describe("ceremonyOf", () => {
  const create = {
    kind: "create",
    origin: "https://portal.weber-haustechnik.test",
    rpId: "weber-haustechnik.test",
    rpName: "Weber Portal",
    user: createOptions.user,
    challenge: "q83vEjRWeJA",
    algorithms: [-7],
    exclude: [],
  };
  const get = {
    kind: "get",
    origin: create.origin,
    rpId: "weber-haustechnik.test",
    challenge: "AA",
    allow: ["AAEC"],
    userVerification: "required",
  };

  it("reads the worker's ceremonies", () => {
    expect(ceremonyOf(create)).toEqual(create);
    expect(ceremonyOf(get)).toEqual(get);
  });

  it("refuses broken ones", () => {
    for (const value of [
      null,
      { ...create, kind: "other" },
      { ...create, origin: 1 },
      { ...create, rpId: undefined },
      { ...create, challenge: "" },
      { ...create, rpName: 3 },
      { ...get, allow: "AAEC" },
    ])
      expect(ceremonyOf(value), JSON.stringify(value)).toBeUndefined();
  });
});

describe("passkeyOpenMessage", () => {
  it("is the worker's push only", () => {
    expect(passkeyOpenMessage({ type: "kennwort-passkey-open" })).toBe(true);
    expect(passkeyOpenMessage({ type: "kennwort-alert-open" })).toBe(false);
    expect(passkeyOpenMessage(null)).toBe(false);
  });
});
