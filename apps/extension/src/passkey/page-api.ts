/**
 * The passkey provider in the page's own world (K-406): it takes the place of
 * `navigator.credentials.create` and `get` for `publicKey` ceremonies, hands them to the content
 * script of its frame (channel.ts) and turns the answer into a PublicKeyCredential the page can use
 * as one from the browser (WebAuthn Level 3, §5.1). Bitwarden's extension does the same, with a
 * fallback to the browser (bitwarden/clients, apps/browser/src/autofill/fido2); this is Kennwort's
 * own code.
 *
 * Whatever runs here the page can run too, so nothing here is trusted and nothing here decides:
 * the content script passes the ceremony to the service worker, which checks frame, origin and rpId
 * itself, and only the prompt, after a click the user made in it, answers. Conditional mediation
 * (passkeys in the autofill menu), other credential types, an answer that does not come and the
 * user's "Anderes Gerät verwenden" all go to the browser's own function, untouched.
 */
import type { AssertionJSON, RegistrationJSON } from "@kennwort/core/webauthn";
import type { PageRequest, PasskeyAnswer } from "./messages.ts";

export type Ask = (
  request: PageRequest,
  signal: AbortSignal | undefined,
) => Promise<PasskeyAnswer | undefined>;

/** The constructors whose prototypes the answer takes, where the browser has them */
export type PageWorld = {
  PublicKeyCredential?: { prototype: object };
  AuthenticatorAttestationResponse?: { prototype: object };
  AuthenticatorAssertionResponse?: { prototype: object };
};

type Container = Pick<CredentialsContainer, "create" | "get">;
type Options = CredentialCreationOptions & CredentialRequestOptions;

const toBase64Url = (source: BufferSource) => {
  const bytes =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string): ArrayBuffer => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
};

const ids = (list: readonly PublicKeyCredentialDescriptor[] | undefined) =>
  (list ?? []).filter((item) => item.type === "public-key").map((item) => toBase64Url(item.id));

/** The page's options as the content script takes them; throws on a shape WebAuthn would refuse */
export const createRequest = (publicKey: PublicKeyCredentialCreationOptions): PageRequest => ({
  type: "passkey-create",
  options: {
    rp: {
      ...(publicKey.rp.id === undefined ? {} : { id: String(publicKey.rp.id) }),
      name: String(publicKey.rp.name),
    },
    user: {
      id: toBase64Url(publicKey.user.id),
      name: String(publicKey.user.name),
      displayName: String(publicKey.user.displayName),
    },
    challenge: toBase64Url(publicKey.challenge),
    algorithms: (publicKey.pubKeyCredParams ?? [])
      .filter((param) => param.type === "public-key")
      .map((param) => param.alg),
    exclude: ids(publicKey.excludeCredentials),
    userVerification: publicKey.authenticatorSelection?.userVerification ?? "preferred",
    ...(publicKey.timeout === undefined ? {} : { timeout: publicKey.timeout }),
  },
});

export const getRequest = (publicKey: PublicKeyCredentialRequestOptions): PageRequest => ({
  type: "passkey-get",
  options: {
    ...(publicKey.rpId === undefined ? {} : { rpId: String(publicKey.rpId) }),
    challenge: toBase64Url(publicKey.challenge),
    allow: ids(publicKey.allowCredentials),
    userVerification: publicKey.userVerification ?? "preferred",
    ...(publicKey.timeout === undefined ? {} : { timeout: publicKey.timeout }),
  },
});

const isRegistration = (json: RegistrationJSON | AssertionJSON): json is RegistrationJSON =>
  "attestationObject" in json.response;

const withPrototype = <T extends object>(value: T, type: { prototype: object } | undefined): T =>
  type ? Object.setPrototypeOf(value, type.prototype) : value;

const responseOf = (json: RegistrationJSON | AssertionJSON, world: PageWorld) => {
  if (isRegistration(json)) {
    const r = json.response;
    return withPrototype(
      {
        clientDataJSON: fromBase64Url(r.clientDataJSON),
        attestationObject: fromBase64Url(r.attestationObject),
        getTransports: () => [...r.transports],
        getAuthenticatorData: () => fromBase64Url(r.authenticatorData),
        getPublicKey: () => fromBase64Url(r.publicKey),
        getPublicKeyAlgorithm: () => r.publicKeyAlgorithm,
      },
      world.AuthenticatorAttestationResponse,
    );
  }
  const r = json.response;
  return withPrototype(
    {
      clientDataJSON: fromBase64Url(r.clientDataJSON),
      authenticatorData: fromBase64Url(r.authenticatorData),
      signature: fromBase64Url(r.signature),
      userHandle: fromBase64Url(r.userHandle),
    },
    world.AuthenticatorAssertionResponse,
  );
};

/** The PublicKeyCredential of the prompt's answer, with toJSON() as WebAuthn Level 3 has it */
export const credentialOf = (json: RegistrationJSON | AssertionJSON, world: PageWorld) =>
  withPrototype(
    {
      id: json.id,
      rawId: fromBase64Url(json.rawId),
      type: json.type,
      authenticatorAttachment: json.authenticatorAttachment,
      response: responseOf(json, world),
      getClientExtensionResults: () => ({}),
      toJSON: () => structuredClone(json),
    },
    world.PublicKeyCredential,
  );

const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError"); // i18n-ignore: for developers

/** Waits for the answer; the page's AbortSignal ends the wait at once */
const answered = (ask: Ask, request: PageRequest, signal: AbortSignal | undefined) => {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  const answer = ask(request, signal);
  if (!signal) return answer;
  return new Promise<PasskeyAnswer | undefined>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    answer.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
};

/** One ceremony: the prompt's credential, its error, or the browser's own function */
const ceremony = async (
  ask: Ask,
  world: PageWorld,
  request: PageRequest,
  options: Options,
  browser: () => Promise<Credential | null>,
): Promise<Credential | null> => {
  const answer = await answered(ask, request, options.signal);
  if (!answer || answer.outcome === "fallback") return browser();
  if (answer.outcome === "error") throw new DOMException(messageOf(answer.name), answer.name);
  return credentialOf(answer.credential, world) as unknown as Credential;
};

/** The browsers' own messages for these errors, for the page's developers */
const messageOf = (name: string) =>
  name === "SecurityError"
    ? "The relying party ID is not a registrable domain suffix of, nor equal to the current domain." // i18n-ignore: for developers
    : "The operation either timed out or was not allowed."; // i18n-ignore: for developers

/** Builds the request, or undefined for a call the browser should answer itself */
const requestFor = (kind: "create" | "get", options: Options | undefined) => {
  if (!options?.publicKey || options.mediation === "conditional") return undefined;
  try {
    return kind === "create"
      ? createRequest(options.publicKey as PublicKeyCredentialCreationOptions)
      : getRequest(options.publicKey as PublicKeyCredentialRequestOptions);
  } catch {
    // A shape WebAuthn refuses: the browser says why
    return undefined;
  }
};

/** Puts Kennwort in front of navigator.credentials.create and get */
export const installPasskeys = (container: Container, ask: Ask, world: PageWorld) => {
  const original = { create: container.create, get: container.get };
  const wrap = (kind: "create" | "get") =>
    function (this: unknown, options?: Options): Promise<Credential | null> {
      const browser = () => original[kind].call(container, options);
      const request = requestFor(kind, options);
      if (!request || !options) return browser();
      return ceremony(ask, world, request, options, browser);
    };
  Object.defineProperty(container, "create", {
    value: wrap("create"),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(container, "get", {
    value: wrap("get"),
    configurable: true,
    writable: true,
  });
};
