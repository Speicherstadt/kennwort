/**
 * WebAuthn options and credentials as Better Auth's passkey plugin (SimpleWebAuthn) sends and
 * reads them as JSON (WebAuthn Level 3, 5.1.8 and 5.1.9). Written out instead of the browser's
 * toJSON(): that one carries the client extension results, and with them the PRF output, which
 * must never reach the server (K-707). Every answer is checked before it is used.
 */
import { bytes, encodeBytes } from "@kennwort/core";

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Canonical base64url to bytes; undefined for anything else */
export const fromBase64Url = (text: unknown) => {
  const parsed = bytes().safeParse(text);
  return parsed.success ? parsed.data : undefined;
};

const VERIFICATION = new Set(["discouraged", "preferred", "required"]);
const verification = (value: unknown) =>
  typeof value === "string" && VERIFICATION.has(value)
    ? (value as UserVerificationRequirement)
    : "preferred";
const timeout = (value: unknown) =>
  typeof value === "number" && value > 0 ? { timeout: value } : {};

/** The credentials to exclude, those with a well-formed ID */
const excluded = (value: unknown): PublicKeyCredentialDescriptor[] =>
  (Array.isArray(value) ? value : []).flatMap((d) => {
    const id = isObject(d) ? fromBase64Url(d.id) : undefined;
    return id ? [{ id: id as BufferSource, type: "public-key" as const }] : [];
  });

const algorithms = (value: unknown): PublicKeyCredentialParameters[] =>
  (Array.isArray(value) ? value : []).flatMap((p) =>
    isObject(p) && typeof p.alg === "number" ? [{ type: "public-key" as const, alg: p.alg }] : [],
  );

/**
 * Better Auth's registration options with the PRF extension evaluated for this passkey's salt;
 * undefined for options that are not well-formed
 */
export const creationOptions = (
  wire: unknown,
  salt: Uint8Array,
): CredentialCreationOptions | undefined => {
  if (!isObject(wire) || !isObject(wire.rp) || !isObject(wire.user)) return undefined;
  const challenge = fromBase64Url(wire.challenge);
  const userId = fromBase64Url(wire.user.id);
  const { name, displayName } = wire.user;
  const params = algorithms(wire.pubKeyCredParams);
  if (!challenge || !userId || typeof name !== "string" || typeof displayName !== "string")
    return undefined;
  if (typeof wire.rp.name !== "string" || params.length === 0) return undefined;
  const selection = isObject(wire.authenticatorSelection) ? wire.authenticatorSelection : {};
  return {
    publicKey: {
      challenge: challenge as BufferSource,
      rp: {
        name: wire.rp.name,
        ...(typeof wire.rp.id === "string" ? { id: wire.rp.id } : {}),
      },
      user: { id: userId as BufferSource, name, displayName },
      pubKeyCredParams: params,
      ...timeout(wire.timeout),
      excludeCredentials: excluded(wire.excludeCredentials),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: verification(selection.userVerification),
      },
      attestation: "none",
      extensions: { prf: { eval: { first: salt as BufferSource } } },
    },
  };
};

/**
 * The request for exactly this passkey, with the PRF extension evaluated for its salt; undefined
 * for options that are not well-formed
 */
export const requestOptions = (
  wire: unknown,
  credentialId: Uint8Array,
  salt: Uint8Array,
): CredentialRequestOptions | undefined => {
  const challenge = isObject(wire) ? fromBase64Url(wire.challenge) : undefined;
  if (!isObject(wire) || !challenge) return undefined;
  return {
    publicKey: {
      challenge: challenge as BufferSource,
      ...(typeof wire.rpId === "string" ? { rpId: wire.rpId } : {}),
      ...timeout(wire.timeout),
      userVerification: verification(wire.userVerification),
      allowCredentials: [{ id: credentialId as BufferSource, type: "public-key" }],
      extensions: { prf: { eval: { first: salt as BufferSource } } },
    },
  };
};

/** What a credential the browser returns has, as far as this file reads it */
export type PublicKeyCredentialLike = {
  rawId: ArrayBuffer;
  type: string;
  authenticatorAttachment?: string | null;
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject?: ArrayBuffer;
    authenticatorData?: ArrayBuffer;
    signature?: ArrayBuffer;
    userHandle?: ArrayBuffer | null;
    getTransports?: () => string[];
  };
  getClientExtensionResults: () => {
    prf?: { enabled?: boolean; results?: { first?: BufferSource } };
  };
};

const text = (value: ArrayBuffer | null | undefined) =>
  value ? encodeBytes(new Uint8Array(value)) : undefined;

/** The credential as the server verifies it, without any client extension result */
export const credentialJson = (credential: PublicKeyCredentialLike) => {
  const r = credential.response;
  const id = encodeBytes(new Uint8Array(credential.rawId));
  const response = Object.fromEntries(
    Object.entries({
      clientDataJSON: text(r.clientDataJSON),
      attestationObject: text(r.attestationObject),
      authenticatorData: text(r.authenticatorData),
      signature: text(r.signature),
      userHandle: text(r.userHandle),
      transports: r.getTransports?.(),
    }).filter(([, value]) => value !== undefined),
  );
  return {
    id,
    rawId: id,
    type: credential.type,
    response,
    clientExtensionResults: {},
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
};

/** The PRF output of a ceremony, copied out of the browser's buffer; undefined without one */
export const prfOutput = (credential: PublicKeyCredentialLike) => {
  const first = credential.getClientExtensionResults().prf?.results?.first;
  if (!first) return undefined;
  const view = ArrayBuffer.isView(first)
    ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
    : new Uint8Array(first);
  const copy = view.length === 32 ? Uint8Array.from(view) : undefined;
  // The browser's buffer is overwritten: the output lives in one place only, the copy
  view.fill(0);
  return copy;
};
