/**
 * The messages of the passkey provider (K-406, P-17), from the page to the prompt and back:
 *
 * - the script in the page's own world (page-api.ts) hands `navigator.credentials.create` or `get`
 *   to the content script of its frame (bridge.ts) as a `PageRequest`, every byte string as
 *   base64url; the content script passes it on to the service worker unchanged and waits;
 * - the worker checks the frame and the rpId against the browser's frame tree (passkey-broker.ts),
 *   holds the checked `Ceremony` and asks the top frame to open the prompt (`kennwort-passkey-open`);
 * - the prompt takes the ceremony (`prompt-take`, save/messages.ts) and, after the user's click,
 *   answers with `prompt-passkey`: a credential, the browser's own WebAuthn, or an error;
 * - the worker answers the content script's waiting request with that `PasskeyAnswer`.
 *
 * Everything from the page is untrusted: the parsers below take only the shapes and sizes WebAuthn
 * allows, and the page learns nothing before the prompt answered.
 */
import type { AssertionJSON, RegistrationJSON } from "@kennwort/core/webauthn";

/** WebAuthn §5.4.3, user.id: at most 64 bytes, so at most 86 base64url characters */
const MAX_USER_ID = 86;
/** Generous for a challenge (16 bytes or more) or a credential ID (at most 1023 bytes) */
const MAX_BYTES = 1400;
const MAX_TEXT = 256;
const MAX_LIST = 64;
/** WebAuthn's recommended ceiling for a ceremony is ten minutes */
export const MAX_TIMEOUT_MS = 600_000;

export type UserVerification = "required" | "preferred" | "discouraged";

/** navigator.credentials.create({ publicKey }) as the page asked */
export type CreateOptions = {
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  /** The COSE algorithms of pubKeyCredParams, in the page's order */
  algorithms: number[];
  /** The IDs of excludeCredentials */
  exclude: string[];
  userVerification: UserVerification;
  timeout?: number;
};

/** navigator.credentials.get({ publicKey }) as the page asked */
export type GetOptions = {
  rpId?: string;
  challenge: string;
  /** The IDs of allowCredentials; empty: any passkey for the rpId */
  allow: string[];
  userVerification: UserVerification;
  timeout?: number;
};

/** From the page's script to its content script, and on to the worker */
export type PageRequest =
  | { type: "passkey-create"; options: CreateOptions }
  | { type: "passkey-get"; options: GetOptions };

/** From the content script to the worker when the page aborted (AbortSignal) */
export type AbortRequest = { type: "passkey-abort" };

export type PasskeyError = "NotAllowedError" | "SecurityError";

/** What the page's call ends with */
export type PasskeyAnswer =
  | { outcome: "credential"; credential: RegistrationJSON | AssertionJSON }
  | { outcome: "fallback" }
  | { outcome: "error"; name: PasskeyError };

/** What the worker checked and the prompt needs: the origin from the frame tree, a valid rpId */
export type Ceremony =
  | {
      kind: "create";
      origin: string;
      rpId: string;
      rpName: string;
      user: CreateOptions["user"];
      challenge: string;
      algorithms: number[];
      exclude: string[];
    }
  | {
      kind: "get";
      origin: string;
      rpId: string;
      challenge: string;
      allow: string[];
      userVerification: UserVerification;
    };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isText = (value: unknown, max = MAX_TEXT): value is string =>
  typeof value === "string" && value.length <= max;
const B64URL = /^[A-Za-z0-9_-]*$/;
const isBytes = (value: unknown, max = MAX_BYTES, min = 1): value is string =>
  typeof value === "string" && value.length >= min && value.length <= max && B64URL.test(value);
const isList = <T>(value: unknown, item: (v: unknown) => v is T): value is T[] =>
  Array.isArray(value) && value.length <= MAX_LIST && value.every((entry) => item(entry));
const isId = (value: unknown): value is string => isBytes(value);
const isAlgorithm = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const VERIFICATION = new Set(["required", "preferred", "discouraged"]);

const userVerification = (value: unknown): UserVerification =>
  VERIFICATION.has(value as string) ? (value as UserVerification) : "preferred";

const timeout = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? { timeout: Math.min(value, MAX_TIMEOUT_MS) }
    : {};

const rpIdOf = (value: unknown) => (isText(value) && value !== "" ? { id: value } : {});

const createOptions = (value: Record<string, unknown>): CreateOptions | undefined => {
  const { rp, user, challenge, algorithms, exclude } = value;
  if (!isObject(rp) || !isText(rp.name) || (rp.id !== undefined && !isText(rp.id)))
    return undefined;
  if (!isObject(user) || !isBytes(user.id, MAX_USER_ID) || !isText(user.name)) return undefined;
  if (!isText(user.displayName) || !isBytes(challenge)) return undefined;
  if (!isList(algorithms, isAlgorithm) || !isList(exclude, isId)) return undefined;
  return {
    rp: { ...rpIdOf(rp.id), name: rp.name },
    user: { id: user.id, name: user.name, displayName: user.displayName },
    challenge,
    algorithms,
    exclude,
    userVerification: userVerification(value.userVerification),
    ...timeout(value.timeout),
  };
};

const getOptions = (value: Record<string, unknown>): GetOptions | undefined => {
  const { rpId, challenge, allow } = value;
  if ((rpId !== undefined && !isText(rpId)) || !isBytes(challenge)) return undefined;
  if (!isList(allow, isId)) return undefined;
  return {
    ...(isText(rpId) && rpId !== "" ? { rpId } : {}),
    challenge,
    allow,
    userVerification: userVerification(value.userVerification),
    ...timeout(value.timeout),
  };
};

/** A request of the page's shape, or undefined */
export const pageRequest = (value: unknown): PageRequest | undefined => {
  if (!isObject(value) || !isObject(value.options)) return undefined;
  if (value.type === "passkey-create") {
    const options = createOptions(value.options);
    return options && { type: "passkey-create", options };
  }
  if (value.type === "passkey-get") {
    const options = getOptions(value.options);
    return options && { type: "passkey-get", options };
  }
  return undefined;
};

export const abortRequest = (value: unknown): AbortRequest | undefined =>
  isObject(value) && value.type === "passkey-abort" ? { type: "passkey-abort" } : undefined;

const ERRORS = new Set<PasskeyError>(["NotAllowedError", "SecurityError"]);

const isResponse = (value: unknown, keys: readonly string[]) =>
  isObject(value) && keys.every((key) => isBytes(value[key], 8192, 0));

const REGISTRATION = ["clientDataJSON", "attestationObject", "authenticatorData", "publicKey"];
const ASSERTION = ["clientDataJSON", "authenticatorData", "signature", "userHandle"];

/** A credential of the prompt's shape (core/webauthn/credential.ts), or undefined */
const credentialOf = (value: unknown): RegistrationJSON | AssertionJSON | undefined => {
  if (!isObject(value) || !isId(value.id) || value.rawId !== value.id) return undefined;
  if (value.type !== "public-key" || value.authenticatorAttachment !== "platform") return undefined;
  const response = value.response;
  if (isResponse(response, REGISTRATION)) {
    const { publicKeyAlgorithm, transports } = response as Record<string, unknown>;
    if (!isAlgorithm(publicKeyAlgorithm) || !isList(transports, isText)) return undefined;
    return value as RegistrationJSON;
  }
  return isResponse(response, ASSERTION) ? (value as AssertionJSON) : undefined;
};

/** An answer of the prompt's (and the worker's) shape, or undefined */
export const passkeyAnswer = (value: unknown): PasskeyAnswer | undefined => {
  if (!isObject(value)) return undefined;
  if (value.outcome === "fallback") return { outcome: "fallback" };
  if (value.outcome === "error")
    return ERRORS.has(value.name as PasskeyError)
      ? { outcome: "error", name: value.name as PasskeyError }
      : undefined;
  if (value.outcome !== "credential") return undefined;
  const credential = credentialOf(value.credential);
  return credential && { outcome: "credential", credential };
};

/** The worker's push to the top frame: open the prompt frame for a passkey */
export const passkeyOpenMessage = (value: unknown) =>
  isObject(value) && value.type === "kennwort-passkey-open";

/** A ceremony of the worker's shape, or undefined (the prompt reads only these) */
export const ceremonyOf = (value: unknown): Ceremony | undefined => {
  if (!isObject(value) || !isText(value.origin, 2048) || !isText(value.rpId)) return undefined;
  if (!isBytes(value.challenge)) return undefined;
  if (value.kind === "create") {
    const options = createOptions({ ...value, rp: { name: value.rpName } });
    if (!options) return undefined;
    const { user, challenge, algorithms, exclude } = options;
    return {
      kind: "create",
      origin: value.origin,
      rpId: value.rpId,
      rpName: options.rp.name,
      user,
      challenge,
      algorithms,
      exclude,
    };
  }
  if (value.kind !== "get") return undefined;
  const options = getOptions(value);
  if (!options) return undefined;
  const { challenge, allow } = options;
  return {
    kind: "get",
    origin: value.origin,
    rpId: value.rpId,
    challenge,
    allow,
    userVerification: options.userVerification,
  };
};
